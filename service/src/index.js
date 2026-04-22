import express from 'express';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { requireAuth } from './middleware.js';
import verifyRoutes from './routes/verify.js';
import loginRoutes from './routes/login.js';
import userRoutes from './routes/users.js';
import configRoutes from './routes/config.js';
import sessionRoutes from './routes/sessions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(verifyRoutes);
app.use(loginRoutes);

const apiRouter = express.Router();
apiRouter.use(requireAuth);
apiRouter.use(userRoutes);
apiRouter.use(configRoutes);
apiRouter.use(sessionRoutes);
app.use(apiRouter);

app.use('/dashboard', requireAuth, express.static(join(__dirname, '..', 'public', 'dashboard')));

app.get('/health', (_req, res) => res.sendStatus(200));

app.get('/', (req, res) => res.redirect('/dashboard'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gatehouse auth service running on :${PORT}`);
});
