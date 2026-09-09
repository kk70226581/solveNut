const mongoose = require("mongoose");

const createModel = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, lowercase: true },
  password: String,
  role: { type: String, default: "client" },
  phone: { type: String, default: "" },
  location: { type: String, default: "" },
  focusArea: { type: String, default: "" },
  resetPasswordTokenHash: String,
  resetPasswordExpires: Date,
});

const expertSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, lowercase: true },
    password: String,
    field: String,
    experience: Number,
    headline: String,
    summary: String,
    skills: { type: [String], default: [] },
    languages: { type: [String], default: ["English"] },
    availability: { type: String, default: "Available this week" },
    sessionCount: { type: Number, default: 0 },
    location: String,
    linkedin: String,
    resumePath: String,
    avatar: String,
    role: { type: String, default: "expert" },
    status: { type: String, default: "pending" },
    price: { type: Number, default: 500 },
    resetPasswordTokenHash: String,
    resetPasswordExpires: Date,
  },
  { timestamps: true }
);

const messageSchema = new mongoose.Schema(
  {
    room: String,
    author: String,
    authorRole: String,
    clientMessageId: String,
    message: String,
    messageType: {
      type: String,
      enum: ["text", "image", "audio", "pdf", "file"],
      default: "text",
    },
    imageUrl: String,
    imageName: String,
    attachmentUrl: String,
    attachmentName: String,
    attachmentMime: String,
  },
  { timestamps: true }
);

const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    paymentId: String,
    signature: String,
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: { type: String, default: "created" },
    clientEmail: { type: String, required: true },
    expertEmail: { type: String, required: true },
    expertField: String,
    clientName: String,
    verified: { type: Boolean, default: false },
    notes: Object,
  },
  { timestamps: true }
);

const ratingSchema = new mongoose.Schema(
  {
    expertEmail: { type: String, required: true, lowercase: true, index: true },
    clientEmail: { type: String, required: true, lowercase: true, index: true },
    room: { type: String, default: "" },
    score: { type: Number, required: true, min: 1, max: 5 },
    review: { type: String, default: "" },
  },
  { timestamps: true }
);

const adminSecuritySchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    totpSecret: { type: String, required: true },
    totpEnabledAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const aiConversationSchema = new mongoose.Schema(
  {
    userId: String,
    userEmail: { type: String, required: true, lowercase: true, index: true },
    domain: { type: String, required: true, index: true },
    title: { type: String, default: "AI Expert consultation" },
    status: {
      type: String,
      enum: ["active", "escalated", "closed"],
      default: "active",
    },
    escalationStatus: {
      type: String,
      enum: ["none", "suggested", "requested", "completed"],
      default: "none",
    },
    escalationReason: {
      type: String,
      enum: ["", "low_confidence", "ai_recommendation", "human_requested", "high_stakes", "service_unavailable"],
      default: "",
    },
    confidenceScore: { type: Number, min: 0, max: 100, default: 0 },
    lastFeedback: {
      type: String,
      enum: ["helped", "partial", "not_helped", ""],
      default: "",
    },
    tokenUsage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
    metadata: Object,
  },
  { timestamps: true }
);

const aiMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AIConversation",
      required: true,
      index: true,
    },
    userEmail: { type: String, required: true, lowercase: true, index: true },
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: { type: String, required: true },
    domain: String,
    confidenceScore: { type: Number, min: 0, max: 100 },
    recommendEscalation: { type: Boolean, default: false },
    escalationReason: { type: String, default: "" },
    tokenUsage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
    rawProviderResponse: Object,
  },
  { timestamps: true }
);

const aiUserFeedbackSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AIConversation",
      required: true,
      index: true,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AIMessage",
    },
    userEmail: { type: String, required: true, lowercase: true, index: true },
    feedback: {
      type: String,
      enum: ["helped", "partial", "not_helped"],
      required: true,
    },
    note: { type: String, default: "" },
    domain: String,
  },
  { timestamps: true }
);

const User = createModel("User", userSchema);
const Expert = createModel("Expert", expertSchema);
const Message = createModel("Message", messageSchema);
const Payment = createModel("Payment", paymentSchema);
const Rating = createModel("Rating", ratingSchema);
const AdminSecurity = createModel("AdminSecurity", adminSecuritySchema);
const AIConversation = createModel("AIConversation", aiConversationSchema);
const AIMessage = createModel("AIMessage", aiMessageSchema);
const AIUserFeedback = createModel("AIUserFeedback", aiUserFeedbackSchema);

const connectDatabase = async (mongoUri) => {
  if (String(process.env.NODE_ENV || "").toLowerCase() === "test") {
    return null;
  }

  await mongoose.connect(mongoUri || "mongodb://localhost:27017/solutionhub");
  return mongoose.connection;
};

module.exports = {
  connectDatabase,
  User,
  Expert,
  Message,
  Payment,
  Rating,
  AdminSecurity,
  AIConversation,
  AIMessage,
  AIUserFeedback,
};
