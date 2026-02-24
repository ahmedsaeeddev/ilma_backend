const express = require('express');
const multer = require('multer');
const path = require('path');
const { auth } = require('../middleware/auth');
const File = require('../models/File');

const router = express.Router();

// Use memory storage for MongoDB storage
const storage = multer.memoryStorage();

// File filter (keeps existing validation)
const fileFilter = (req, file, cb) => {
    const allowedTypes = {
        video: /mp4|mov|avi|mkv|webm/,
        document: /pdf|doc|docx|ppt|pptx|txt/,
        image: /jpeg|jpg|png|gif|svg/
    };

    const ext = path.extname(file.originalname).toLowerCase();
    const mimetype = file.mimetype.toLowerCase();

    if (allowedTypes.video.test(ext) || mimetype.startsWith('video/')) {
        return cb(null, true);
    }
    if (allowedTypes.document.test(ext) || mimetype.includes('pdf') || mimetype.includes('document')) {
        return cb(null, true);
    }
    if (allowedTypes.image.test(ext) || mimetype.startsWith('image/')) {
        return cb(null, true);
    }
    cb(new Error('File type not supported.'));
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 15 * 1024 * 1024 // 15MB limit for MongoDB documents
    },
    fileFilter: fileFilter
});

// @route   POST /api/upload
// @desc    Upload file to MongoDB
router.post('/', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const newFile = new File({
            filename: `file-${Date.now()}${path.extname(req.file.originalname)}`,
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            data: req.file.buffer,
            contentType: req.file.mimetype,
            uploadedBy: req.user._id
        });

        const savedFile = await newFile.save();
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const fileUrl = `${baseUrl}/api/upload/file/${savedFile._id}`;

        res.json({
            message: 'File uploaded to database successfully',
            id: savedFile._id,
            filename: savedFile.filename,
            originalName: savedFile.originalName,
            url: fileUrl,
            size: savedFile.size,
            mimetype: savedFile.mimetype
        });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ message: 'Error saving file to database' });
    }
});

// @route   GET /api/upload/file/:id
// @desc    Get file from MongoDB
router.get('/file/:id', async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        res.set({
            'Content-Type': file.contentType,
            'Content-Disposition': `inline; filename="${file.originalName}"`,
            'Content-Length': file.data.length
        });

        res.send(file.data);
    } catch (err) {
        console.error('Retrieval error:', err);
        res.status(500).json({ message: 'Error retrieving file' });
    }
});

module.exports = router;
