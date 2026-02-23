const fs = require('fs');
const path = require('path');

const DEPLOY_DIR = path.join(__dirname, '..', 'build');
const UPLOADS_DIR = path.join(DEPLOY_DIR, 'uploads');

// Files and folders to copy
const ASSETS_TO_COPY = [
    'middleware',
    'models',
    'routes',
    'scripts',
    'server.js',
    'package.json',
    'package-lock.json',
    '.env' // Optional: usually handled by environment variables in production, but included for complete copy
];

function deleteFolderRecursive(directoryPath) {
    if (fs.existsSync(directoryPath)) {
        fs.readdirSync(directoryPath).forEach((file) => {
            const curPath = path.join(directoryPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(directoryPath);
    }
}

function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest);
        }
        fs.readdirSync(src).forEach((childItemName) => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

console.log('🚀 Starting production build...');

// 1. Clean build directory
if (fs.existsSync(DEPLOY_DIR)) {
    console.log('🧹 Cleaning old build folder...');
    deleteFolderRecursive(DEPLOY_DIR);
}

// 2. Create build directory
fs.mkdirSync(DEPLOY_DIR);
console.log('📁 Created build folder.');

// 3. Copy assets
ASSETS_TO_COPY.forEach(asset => {
    const src = path.join(__dirname, '..', asset);
    const dest = path.join(DEPLOY_DIR, asset);

    if (fs.existsSync(src)) {
        console.log(`📦 Copying ${asset}...`);
        copyRecursiveSync(src, dest);
    } else {
        console.warn(`⚠️ Warning: ${asset} not found, skipping.`);
    }
});

// 4. Create uploads folder
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
    console.log('🖼️ Created uploads folder in build.');
}

console.log('✨ Build completed successfully! Production files are in /build');
