const express = require('express');
const router = express.Router();
const Appeal = require('../models/Appeal');
const Enrollment = require('../models/Enrollment');
const { auth, authorize } = require('../middleware/auth');
const Notification = require('../models/Notification');

// @route   POST /api/appeals
// @desc    Submit a re-joining appeal
// @access  Private (Student)
router.post('/', auth, authorize('student'), async (req, res) => {
    try {
        const { courseId, reason } = req.body;

        if (!courseId || !reason) {
            return res.status(400).json({ message: 'Course ID and reason are required' });
        }

        // Find existing enrollment
        const enrollment = await Enrollment.findOne({
            student: req.user._id,
            course: courseId
        });

        if (!enrollment) {
            return res.status(404).json({ message: 'No prior enrollment found for this course' });
        }

        if (enrollment.status === 'enrolled') {
            return res.status(400).json({ message: 'You are already enrolled in this course' });
        }

        // Check if there is already a pending appeal
        const existingAppeal = await Appeal.findOne({
            student: req.user._id,
            course: courseId,
            status: 'pending'
        });

        if (existingAppeal) {
            return res.status(400).json({ message: 'You already have a pending appeal for this course' });
        }

        const appeal = new Appeal({
            student: req.user._id,
            course: courseId,
            enrollment: enrollment._id,
            reason
        });

        await appeal.save();

        res.status(201).json({
            message: 'Appeal submitted successfully',
            appeal
        });
    } catch (error) {
        console.error('Submit appeal error:', error);
        res.status(500).json({ message: 'Server error while submitting appeal' });
    }
});

// @route   GET /api/appeals/admin
// @desc    Get all appeals for admin
// @access  Private (Admin)
router.get('/admin', auth, authorize('admin'), async (req, res) => {
    try {
        const appeals = await Appeal.find()
            .populate('student', 'firstName lastName email')
            .populate('course', 'title courseCode')
            .sort({ createdAt: -1 });

        res.json(appeals);
    } catch (error) {
        console.error('Get admin appeals error:', error);
        res.status(500).json({ message: 'Server error while fetching appeals' });
    }
});

// @route   PUT /api/appeals/:id/respond
// @desc    Approve or reject an appeal
// @access  Private (Admin)
router.put('/:id/respond', auth, authorize('admin'), async (req, res) => {
    try {
        const { status, adminNote } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const appeal = await Appeal.findById(req.params.id)
            .populate('course', 'title');
        if (!appeal) {
            return res.status(404).json({ message: 'Appeal not found' });
        }

        if (appeal.status !== 'pending') {
            return res.status(400).json({ message: 'Appeal has already been processed' });
        }

        appeal.status = status;
        appeal.adminNote = adminNote;
        appeal.reviewedBy = req.user._id;
        appeal.reviewedAt = Date.now();

        await appeal.save();

        if (status === 'approved') {
            // Update enrollment status
            await Enrollment.findByIdAndUpdate(appeal.enrollment, {
                status: 'enrolled'
            });
        }

        // Create notification for student
        const notification = new Notification({
            recipient: appeal.student,
            title: `Appeal ${status.charAt(0).toUpperCase() + status.slice(1)}`,
            message: `Your re-joining appeal for ${appeal.course?.title || 'the course'} has been ${status}.`,
            type: 'system' // Using 'system' as it is a safe enum value
        });
        await notification.save();

        res.json({
            message: `Appeal ${status} successfully`,
            appeal
        });
    } catch (error) {
        console.error('Respond to appeal error:', error);
        res.status(500).json({ message: 'Server error while processing appeal' });
    }
});

module.exports = router;

