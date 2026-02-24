/**
 * models/Prompt.js — Mongoose schema for prompt documents
 *
 * Stores the full lifecycle of a prompt: raw input, structured versions,
 * analysis results (intent, gaps, scores, warnings), and version history.
 */

const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema(
    {
        label: { type: String, required: true },   // e.g. "v0_raw", "v1_structured", "v2_refined"
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const scoreSchema = new mongoose.Schema(
    {
        clarity: { type: Number, min: 0, max: 10, default: 0 },
        completeness: { type: Number, min: 0, max: 10, default: 0 },
        specificity: { type: Number, min: 0, max: 10, default: 0 },
        intentAlignment: { type: Number, min: 0, max: 10, default: 0 },
        total: { type: Number, min: 0, max: 40, default: 0 },
    },
    { _id: false }
);

const promptSchema = new mongoose.Schema(
    {
        promptId: { type: String, required: true, unique: true, index: true },
        versions: [versionSchema],
        intent: {
            detected: { type: String, default: '' },
            confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'low' },
            source: { type: String, enum: ['ai', 'rule', 'hybrid'], default: 'rule' },
        },
        constraints: {
            language: { type: String, default: '' },
            level: { type: String, default: '' },
            outputFormat: { type: String, default: '' },
            scope: { type: String, default: '' },
            examples: { type: String, default: '' },
        },
        gaps: [String],
        suggestions: { type: mongoose.Schema.Types.Mixed, default: {} },
        scores: { type: scoreSchema, default: () => ({}) },
        warnings: [String],
        driftWarning: { type: String, default: '' },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Prompt', promptSchema);
