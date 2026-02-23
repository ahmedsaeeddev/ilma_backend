const mongoose = require('mongoose');

const appealSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    enrollment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Enrollment',
        required: true
    },
    reason: {
        type: String,
        required: [true, 'Please provide a reason for re-joining'],
        trim: true,
        maxlength: [1000, 'Reason cannot exceed 1000 characters']
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    adminNote: {
        type: String,
        trim: true
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Index for performance
appealSchema.index({ status: 1 });
appealSchema.index({ student: 1 });
appealSchema.index({ course: 1 });

module.exports = mongoose.model('Appeal', appealSchema);
