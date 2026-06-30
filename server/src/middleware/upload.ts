import multer from 'multer';
import path from 'path';
import { AppError } from '../utils/AppError';

// Store files in memory — we process immediately and store only extracted stats.
const storage = multer.memoryStorage();

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowed = ['.xls', '.xlsx', '.csv'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new AppError('Only .xls, .xlsx, and .csv files are accepted', 400));
  }
};

export const uploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
}).single('file');
