const fs = require('fs');
const path = require('path');
const os = require('os');
const { formidable } = require('formidable');
const nodemailer = require('nodemailer');

const EMAIL_TO = 'yoniafek1@gmail.com';

function getVideosDir() {
  return path.join(process.cwd(), 'videos');
}

function ensureVideosDir() {
  const dir = getVideosDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS environment variables are required');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      uploadDir: os.tmpdir(),
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024
    });

    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function getVideoFile(files) {
  const entry = files.video;
  if (!entry) return null;
  return Array.isArray(entry) ? entry[0] : entry;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { files } = await parseForm(req);
    const videoFile = getVideoFile(files);

    if (!videoFile || !videoFile.filepath) {
      return res.status(400).json({ error: 'No video file received' });
    }

    const buffer = fs.readFileSync(videoFile.filepath);
    const originalName = videoFile.originalFilename || 'reaction.webm';
    const timestamp = Date.now();
    const savedName = `reaction-${timestamp}${path.extname(originalName) || '.webm'}`;

    try {
      const videosDir = ensureVideosDir();
      fs.writeFileSync(path.join(videosDir, savedName), buffer);
    } catch (saveErr) {
      console.warn('Local save skipped:', saveErr.message);
    }

    const transporter = createTransporter();

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: EMAIL_TO,
      subject: 'התארסנו! סרטון תגובה',
      text: 'סרטון התגובה מהמשחק',
      attachments: [
        {
          filename: savedName,
          content: buffer
        }
      ]
    });

    try {
      fs.unlinkSync(videoFile.filepath);
    } catch {
      /* ignore cleanup errors */
    }

    return res.status(200).json({ success: true, filename: savedName });
  } catch (err) {
    console.error('Upload handler error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
