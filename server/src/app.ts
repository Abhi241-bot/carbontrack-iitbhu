import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import config from './config/env';
import routes from './routes/index';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';

const app = express();

// Log every incoming request before any middleware — confirms requests reach Express
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.path} | origin: ${req.headers.origin ?? '(none)'}`);
  next();
});

// 1. CORS first — before helmet and everything else
console.log('[CORS] Allowed origins:', config.allowedOrigins);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server / curl (no Origin header)
    if (!origin) return callback(null, true);
    // In development accept any localhost port — Vite auto-increments when port is busy
    if (config.nodeEnv !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (config.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Rejected origin: ${origin}`);
    callback(new Error(`Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['set-cookie'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Security headers
app.use(helmet());

// Request logging (development only)
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Cookie parser
app.use(cookieParser());

// Rate limiting for all API routes
app.use('/api', apiLimiter);

// Routes
app.use('/api', routes);

// Global error handler (must be last)
app.use(errorHandler);

export default app;
