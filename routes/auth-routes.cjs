const crypto = require("crypto");

const registerAuthRoutes = (app, deps) => {
  const {
    bcrypt,
    jwt,
    fetch,
    upload,
    fileToDataUrl,
    User,
    Expert,
    AdminSecurity,
    authRateLimiter,
    authMiddleware,
    validatePasswordStrength,
    passwordSaltRounds,
    passwordPolicy,
    jwtSecret,
    googleClientId,
    adminAllowedEmails,
    getAdmin2FASecret,
    verifyTOTP,
    QRCode,
    sendPasswordResetEmail,
    emailProvider,
    frontendBaseUrl,
    frontendRouterMode,
  } = deps;

  const buildResetLink = (resetToken) => {
    const cleanBase = String(frontendBaseUrl || "http://localhost:5173").replace(/\/+$/, "");
    const resetPath = `login?mode=reset&token=${encodeURIComponent(resetToken)}`;
    return frontendRouterMode === "hash"
      ? `${cleanBase}/#/${resetPath}`
      : `${cleanBase}/${resetPath}`;
  };

  const toBase32 = (buffer) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    let output = "";
    for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
    for (let i = 0; i < bits.length; i += 5) {
      const chunk = bits.slice(i, i + 5).padEnd(5, "0");
      output += alphabet[parseInt(chunk, 2)];
    }
    return output;
  };

  app.post("/api/register", authRateLimiter, async (req, res) => {
    try {
      const { name, email, password } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ error: "All fields required" });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      const passwordErr = validatePasswordStrength(password);
      if (passwordErr) {
        return res.status(400).json({ error: passwordErr });
      }

      const hash = await bcrypt.hash(password, passwordSaltRounds);
      const newUser = await User.create({
        name: String(name).trim(),
        email: normalizedEmail,
        password: hash,
      });

      console.log("Client registered:", normalizedEmail);
      return res.json({
        success: true,
        user: {
          name: newUser.name,
          email: newUser.email,
          role: newUser.role || "client",
        },
      });
    } catch (err) {
      console.error("Registration error:", err);
      return res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/login", authRateLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");

      const user = await User.findOne({ email });
      if (user?.password && (await bcrypt.compare(password, user.password))) {
        const token = jwt.sign(
          { email: user.email, role: "client", name: user.name },
          jwtSecret,
          { expiresIn: "24h" }
        );

        console.log("Client logged in:", user.email);
        return res.json({
          success: true,
          token,
          email: user.email,
          name: user.name,
          role: "client",
        });
      }

      const expert = await Expert.findOne({ email });
      if (expert?.password && (await bcrypt.compare(password, expert.password))) {
        const token = jwt.sign(
          { email: expert.email, role: "expert", name: expert.name },
          jwtSecret,
          { expiresIn: "24h" }
        );

        console.log("Expert logged in:", expert.email, "| Status:", expert.status);
        return res.json({
          success: true,
          token,
          email: expert.email,
          name: expert.name,
          role: "expert",
          status: expert.status,
        });
      }

      return res.status(401).json({ error: "Invalid credentials" });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  const verifyGoogleIdToken = async (idToken) => {
    if (!googleClientId) {
      const err = new Error("GOOGLE_CLIENT_ID is not configured on server");
      err.status = 500;
      throw err;
    }

    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    const verifyData = await verifyRes.json().catch(() => ({}));

    if (!verifyRes.ok || verifyData?.error) {
      const err = new Error("Invalid Google token");
      err.status = 401;
      throw err;
    }

    const aud = String(verifyData.aud || "");
    const email = String(verifyData.email || "").trim().toLowerCase();
    const emailVerified = String(verifyData.email_verified || "false") === "true";

    if (aud !== googleClientId) {
      const err = new Error("Google token audience mismatch");
      err.status = 401;
      throw err;
    }
    if (!email || !emailVerified) {
      const err = new Error("Google email is not verified");
      err.status = 401;
      throw err;
    }

    return {
      email,
      name: String(verifyData.name || email.split("@")[0]).trim(),
      picture: String(verifyData.picture || "").trim(),
    };
  };

  app.get("/api/google-auth-config", (req, res) => {
    return res.json({
      success: true,
      hasGoogleClientId: Boolean(googleClientId),
      googleClientId: googleClientId || "",
    });
  });

  app.post("/api/google-auth", authRateLimiter, async (req, res) => {
    try {
      const idToken = String(req.body?.idToken || "");
      const requestedRole = String(req.body?.role || "client").toLowerCase();

      if (!idToken) {
        return res.status(400).json({ error: "Google ID token required" });
      }
      if (requestedRole !== "client") {
        return res.status(400).json({ error: "Google signup is currently available for clients only" });
      }

      const googleProfile = await verifyGoogleIdToken(idToken);
      const existingExpert = await Expert.findOne({ email: googleProfile.email });

      if (existingExpert) {
        const token = jwt.sign(
          { email: existingExpert.email, role: "expert", name: existingExpert.name },
          jwtSecret,
          { expiresIn: "24h" }
        );

        return res.json({
          success: true,
          token,
          email: existingExpert.email,
          name: existingExpert.name,
          role: "expert",
          status: existingExpert.status,
          isNewUser: false,
        });
      }

      let user = await User.findOne({ email: googleProfile.email });
      let isNewUser = false;

      if (!user) {
        user = await User.create({
          name: googleProfile.name,
          email: googleProfile.email,
          role: "client",
        });
        isNewUser = true;
      }

      const token = jwt.sign(
        { email: user.email, role: "client", name: user.name || googleProfile.name },
        jwtSecret,
        { expiresIn: "24h" }
      );

      return res.json({
        success: true,
        token,
        email: user.email,
        name: user.name || googleProfile.name,
        role: "client",
        isNewUser,
      });
    } catch (err) {
      console.error("Google auth error:", err);
      return res.status(err.status || 500).json({ error: err.message || "Google auth failed" });
    }
  });

  app.post(
    "/api/pro-signup",
    authRateLimiter,
    upload.fields([
      { name: "resume", maxCount: 1 },
      { name: "photo", maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const {
          name,
          email,
          password,
          field,
          experience,
          headline,
          summary,
          linkedin,
          price,
        } = req.body;

        if (
          !name ||
          !email ||
          !password ||
          !field ||
          !experience ||
          !headline ||
          !summary ||
          !price
        ) {
          return res.status(400).json({ error: "All required fields must be filled" });
        }

        if (!req.files?.resume?.[0] || !req.files?.photo?.[0]) {
          return res.status(400).json({ error: "Photo and resume are required" });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const existingExpert = await Expert.findOne({ email: normalizedEmail });
        if (existingExpert) {
          return res.status(400).json({ error: "Expert with this email already exists" });
        }

        const passwordErr = validatePasswordStrength(password);
        if (passwordErr) {
          return res.status(400).json({ error: passwordErr });
        }

        const hash = await bcrypt.hash(password, passwordSaltRounds);
        const photoFile = req.files.photo[0];
        let avatarValue = photoFile.path;

        try {
          avatarValue = fileToDataUrl(photoFile.path, photoFile.mimetype);
        } catch (imgErr) {
          console.warn("Could not convert signup photo to data URL:", imgErr.message);
        }

        const newExpert = await Expert.create({
          name: String(name).trim(),
          email: normalizedEmail,
          password: hash,
          field: String(field).trim(),
          experience: Number.parseInt(experience, 10),
          headline: String(headline).trim(),
          summary: String(summary).trim(),
          linkedin: String(linkedin || "").trim(),
          price: Number.parseInt(price, 10),
          resumePath: req.files.resume[0].path,
          avatar: avatarValue,
          status: "pending",
        });

        console.log("Expert registered:", newExpert.email);
        return res.json({
          success: true,
          message: "Registration successful! Your profile will be reviewed by our team.",
          expert: {
            name: newExpert.name,
            email: newExpert.email,
            role: "expert",
            field: newExpert.field,
            headline: newExpert.headline,
            experience: newExpert.experience,
            price: newExpert.price,
            avatar: newExpert.avatar,
            status: newExpert.status,
          },
        });
      } catch (err) {
        console.error("Professional signup error:", err);
        return res.status(500).json({ error: `Registration failed: ${err.message}` });
      }
    }
  );

  app.put("/api/profile", authMiddleware, async (req, res) => {
    try {
      if (req.user?.role === "client") {
        const updates = {};
        for (const [key, limit] of Object.entries({ name: 100, phone: 40, location: 160, focusArea: 500 })) {
          if (req.body[key] === undefined) continue;
          if (typeof req.body[key] !== "string" || req.body[key].trim().length > limit || (key === "name" && !req.body[key].trim())) {
            return res.status(400).json({ error: `Please provide a valid ${key} (up to ${limit} characters)` });
          }
          updates[key] = req.body[key].trim();
        }
        const user = await User.findOneAndUpdate(
          { email: String(req.user.email || "").toLowerCase(), role: "client" },
          { $set: updates }, { new: true, runValidators: true }
        ).select("name email phone location focusArea");
        if (!user) return res.status(404).json({ error: "Client not found" });
        return res.json({ success: true, user });
      }
      if (req.user?.role !== "expert") {
        return res.status(403).json({ error: "Only experts can update this profile" });
      }

      const email = String(req.user.email || "").toLowerCase();
      if (!email) {
        return res.status(400).json({ error: "Invalid auth token" });
      }

      const allowed = [
        "name",
        "field",
        "headline",
        "summary",
        "location",
        "linkedin",
        "price",
        "experience",
      ];
      const updates = {};

      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          updates[key] = req.body[key];
        }
      }

      if (req.body.bio !== undefined) {
        updates.summary = req.body.bio;
      }

      if (updates.price !== undefined) {
        const parsedPrice = Number(updates.price);
        updates.price = Number.isFinite(parsedPrice) ? parsedPrice : 0;
      }

      if (updates.experience !== undefined) {
        const parsedExperience = Number(updates.experience);
        updates.experience = Number.isFinite(parsedExperience) ? parsedExperience : 0;
      }

      const expert = await Expert.findOneAndUpdate({ email }, { $set: updates }, { new: true }).select("-password");
      if (!expert) {
        return res.status(404).json({ error: "Expert not found" });
      }

      return res.json({ success: true, expert });
    } catch (err) {
      console.error("Profile update error:", err);
      return res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.get("/api/password-policy", (req, res) => {
    return res.json({ success: true, policy: passwordPolicy });
  });

  app.post("/api/forgot-password", authRateLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      let account = await User.findOne({ email });
      let role = "client";
      if (!account) {
        account = await Expert.findOne({ email });
        role = "expert";
      }

      if (!account) {
        return res.json({
          success: true,
          message: "If this email is registered, a reset link has been generated.",
        });
      }

      const resetToken = jwt.sign({ type: "password_reset", email, role }, jwtSecret, {
        expiresIn: "15m",
      });
      const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

      account.resetPasswordTokenHash = tokenHash;
      account.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
      await account.save();

      const resetLink = buildResetLink(resetToken);
      const mailResult = await sendPasswordResetEmail({ toEmail: email, resetLink });

      if (!mailResult.ok) {
        console.warn(`Reset email delivery issue for ${email}: ${mailResult.error}`);
      } else {
        console.log(`Password reset email sent to ${email} via ${emailProvider}`);
      }

      const response = {
        success: true,
        message: "If this email is registered, a reset link has been generated.",
      };

      if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
        response.resetLink = resetLink;
        response.token = resetToken;
        response.emailDelivery = mailResult.ok ? "sent" : `not_sent: ${mailResult.error}`;
      }

      return res.json(response);
    } catch (err) {
      console.error("Forgot password error:", err);
      return res.status(500).json({ error: "Failed to process forgot password request" });
    }
  });

  app.post("/api/reset-password", authRateLimiter, async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      const password = String(req.body?.password || "");

      if (!token || !password) {
        return res.status(400).json({ error: "Token and new password are required" });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, jwtSecret);
      } catch {
        return res.status(400).json({ error: "Reset token is invalid or expired" });
      }

      if (decoded?.type !== "password_reset") {
        return res.status(400).json({ error: "Invalid reset token type" });
      }

      const email = String(decoded.email || "").toLowerCase();
      const role = String(decoded.role || "");
      const Model = role === "expert" ? Expert : User;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const account = await Model.findOne({
        email,
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpires: { $gt: new Date() },
      });

      if (!account) {
        return res.status(400).json({ error: "Reset token is invalid or expired" });
      }

      const passwordErr = validatePasswordStrength(password);
      if (passwordErr) {
        return res.status(400).json({ error: passwordErr });
      }

      account.password = await bcrypt.hash(password, passwordSaltRounds);
      account.resetPasswordTokenHash = undefined;
      account.resetPasswordExpires = undefined;
      await account.save();

      return res.json({ success: true, message: "Password reset successful. Please login." });
    } catch (err) {
      console.error("Reset password error:", err);
      return res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.put("/api/profile/photo", authMiddleware, upload.single("photo"), async (req, res) => {
    try {
      if (req.user?.role !== "expert") {
        return res.status(403).json({ error: "Only experts can update profile photo" });
      }

      const email = String(req.user.email || "").toLowerCase();
      if (!email) {
        return res.status(400).json({ error: "Invalid auth token" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Photo file is required" });
      }

      let avatarValue = req.file.path;
      try {
        avatarValue = fileToDataUrl(req.file.path, req.file.mimetype);
      } catch (imgErr) {
        console.warn("Could not convert profile photo to data URL:", imgErr.message);
      }

      const expert = await Expert.findOneAndUpdate(
        { email },
        { $set: { avatar: avatarValue } },
        { new: true }
      ).select("-password");

      if (!expert) {
        return res.status(404).json({ error: "Expert not found" });
      }

      return res.json({ success: true, expert });
    } catch (err) {
      console.error("Profile photo update error:", err);
      return res.status(500).json({ error: "Failed to update profile photo" });
    }
  });

  app.get("/api/admin/auth-config", (req, res) => {
    const hasGlobal2FASecret = Boolean(getAdmin2FASecret(""));
    const hasPerEmail2FASecrets = adminAllowedEmails.some((email) => Boolean(getAdmin2FASecret(email)));
    const has2FASecret = hasGlobal2FASecret || hasPerEmail2FASecrets;

    return res.json({
      success: true,
      hasGoogleClientId: Boolean(googleClientId),
      googleClientId: googleClientId || "",
      hasAllowedAdminEmails: adminAllowedEmails.length > 0,
      has2FASecret,
      hasPerEmail2FASecrets,
      hasGlobal2FASecret,
      allowedAdminEmailsCount: adminAllowedEmails.length,
    });
  });

  app.post("/api/admin/google-auth", async (req, res) => {
    try {
      const idToken = String(req.body?.idToken || "");
      if (!idToken) {
        return res.status(400).json({ error: "Google ID token required" });
      }
      if (!googleClientId) {
        return res.status(500).json({ error: "GOOGLE_CLIENT_ID is not configured on server" });
      }

      const verifyRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
      );
      const verifyData = await verifyRes.json().catch(() => ({}));

      if (!verifyRes.ok || verifyData?.error) {
        return res.status(401).json({ error: "Invalid Google token" });
      }

      const aud = String(verifyData.aud || "");
      const email = String(verifyData.email || "").toLowerCase();
      const emailVerified = String(verifyData.email_verified || "false") === "true";

      if (aud !== googleClientId) {
        return res.status(401).json({ error: "Google token audience mismatch" });
      }
      if (!email || !emailVerified) {
        return res.status(401).json({ error: "Google email is not verified" });
      }
      if (adminAllowedEmails.length > 0 && !adminAllowedEmails.includes(email)) {
        return res.status(403).json({ error: "Admin email not authorized" });
      }
      
      // Issue session token directly (2FA removed)
      const adminSessionToken = jwt.sign(
        { email, type: "admin", role: "admin" },
        jwtSecret,
        { expiresIn: "8h" }
      );

      return res.json({
        success: true,
        email,
        adminSessionToken,
      });
    } catch (err) {
      console.error("Admin google-auth error:", err);
      return res.status(500).json({ error: "Admin Google auth failed" });
    }
  });

  app.post("/api/admin/2fa/verify", async (req, res) => {
    try {
      const pre2faToken = String(req.body?.pre2faToken || "");
      const code = String(req.body?.code || "");
      if (!pre2faToken || !code) {
        return res.status(400).json({ error: "pre2faToken and code are required" });
      }

      let decoded;
      try {
        decoded = jwt.verify(pre2faToken, jwtSecret);
      } catch {
        return res.status(401).json({ error: "Invalid or expired pre-2FA token" });
      }

      if (decoded?.type !== "admin_pre2fa") {
        return res.status(401).json({ error: "Invalid pre-2FA token type" });
      }

      const email = String(decoded.email || "").toLowerCase();
      const enrolledAdmin = await AdminSecurity.findOne({ email }).select("totpSecret");
      const secret = enrolledAdmin?.totpSecret || getAdmin2FASecret(email);
      if (!secret) {
        return res.status(409).json({ error: "2FA is not enrolled yet" });
      }

      if (!verifyTOTP(code, secret, 1)) {
        return res.status(401).json({ error: "Invalid 2FA code" });
      }

      const adminSessionToken = jwt.sign(
        { email, type: "admin", role: "admin" },
        jwtSecret,
        { expiresIn: "8h" }
      );

      return res.json({ success: true, adminSessionToken, email });
    } catch (err) {
      console.error("Admin 2FA verify error:", err);
      return res.status(500).json({ error: "Admin 2FA verification failed" });
    }
  });

  app.post("/api/admin/2fa/setup", async (req, res) => {
    try {
      const pre2faToken = String(req.body?.pre2faToken || "");
      if (!pre2faToken) {
        return res.status(400).json({ error: "pre2faToken is required" });
      }

      let decoded;
      try {
        decoded = jwt.verify(pre2faToken, jwtSecret);
      } catch {
        return res.status(401).json({ error: "Invalid or expired pre-2FA token" });
      }
      if (decoded?.type !== "admin_pre2fa") {
        return res.status(401).json({ error: "Invalid pre-2FA token type" });
      }

      const email = String(decoded.email || "").toLowerCase();
      const secret = toBase32(crypto.randomBytes(20));
      const issuer = "SolutionHub";
      const label = `${issuer}:${email}`;
      const otpauthUrl =
        `otpauth://totp/${encodeURIComponent(label)}` +
        `?secret=${encodeURIComponent(secret)}` +
        `&issuer=${encodeURIComponent(issuer)}` +
        "&algorithm=SHA1&digits=6&period=30";
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: 220,
        margin: 1,
      });
      const setupToken = jwt.sign(
        { email, type: "admin_2fa_setup", secret },
        jwtSecret,
        { expiresIn: "10m" }
      );

      return res.json({
        success: true,
        setupToken,
        secret,
        otpauthUrl,
        qrDataUrl,
      });
    } catch (err) {
      console.error("Admin 2FA setup error:", err);
      return res.status(500).json({ error: "Admin 2FA setup failed" });
    }
  });

  app.post("/api/admin/2fa/confirm-setup", async (req, res) => {
    try {
      const setupToken = String(req.body?.setupToken || "");
      const code = String(req.body?.code || "");
      if (!setupToken || !code) {
        return res.status(400).json({ error: "setupToken and code are required" });
      }

      let decoded;
      try {
        decoded = jwt.verify(setupToken, jwtSecret);
      } catch {
        return res.status(401).json({ error: "Invalid or expired setup token" });
      }
      if (decoded?.type !== "admin_2fa_setup") {
        return res.status(401).json({ error: "Invalid setup token type" });
      }

      const email = String(decoded.email || "").toLowerCase();
      const secret = String(decoded.secret || "");
      if (!verifyTOTP(code, secret, 1)) {
        return res.status(401).json({ error: "Invalid 2FA code" });
      }

      await AdminSecurity.findOneAndUpdate(
        { email },
        {
          $set: {
            email,
            totpSecret: secret,
            totpEnabledAt: new Date(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const adminSessionToken = jwt.sign(
        { email, type: "admin", role: "admin" },
        jwtSecret,
        { expiresIn: "8h" }
      );

      return res.json({ success: true, adminSessionToken, email });
    } catch (err) {
      console.error("Admin 2FA setup confirmation error:", err);
      return res.status(500).json({ error: "Admin 2FA setup confirmation failed" });
    }
  });
};

module.exports = {
  registerAuthRoutes,
};
