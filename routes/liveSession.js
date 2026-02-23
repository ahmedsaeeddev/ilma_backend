const express = require('express');
const router = express.Router();
const LiveSession = require('../models/LiveSession');
const { auth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// Create a new live session (instructor only)
router.post('/', auth, async (req, res) => {
    try {
        if (req.user.role !== 'instructor' && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only instructors can create live classes' });
        }

        const { title, description } = req.body;
        const classId = uuidv4().slice(0, 8).toUpperCase();

        const session = new LiveSession({
            classId,
            title: title || 'Live Class',
            description: description || '',
            instructorId: req.user._id,
            instructorName: `${req.user.firstName} ${req.user.lastName}`,
            status: 'waiting',
            startedAt: new Date()
        });

        await session.save();
        res.status(201).json({ success: true, session });
    } catch (error) {
        console.error('Error creating live session:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get session by classId
router.get('/:classId', auth, async (req, res) => {
    try {
        const session = await LiveSession.findOne({ classId: req.params.classId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        res.json({ success: true, session });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all active sessions
router.get('/', auth, async (req, res) => {
    try {
        const sessions = await LiveSession.find({ status: { $in: ['waiting', 'live'] } })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json({ success: true, sessions });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// End a session
router.patch('/:classId/end', auth, async (req, res) => {
    try {
        const session = await LiveSession.findOneAndUpdate(
            { classId: req.params.classId },
            { status: 'ended', endedAt: new Date() },
            { new: true }
        );
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        res.json({ success: true, session });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
