const mongoose = require('mongoose');

const liveSessionSchema = new mongoose.Schema({
    classId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ''
    },
    instructorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    instructorName: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['waiting', 'live', 'ended'],
        default: 'waiting'
    },
    participants: [{
        userId: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        role: {
            type: String,
            enum: ['instructor', 'student'],
            default: 'student'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        },
        leftAt: {
            type: Date
        }
    }],
    maxParticipants: {
        type: Number,
        default: 20
    },
    startedAt: {
        type: Date
    },
    endedAt: {
        type: Date
    },
    chatMessages: [{
        senderId: String,
        senderName: String,
        message: String,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

liveSessionSchema.index({ status: 1 });
liveSessionSchema.index({ instructorId: 1 });
liveSessionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('LiveSession', liveSessionSchema);
