import { Router, type IRouter } from "express";
import healthRouter from "./health";
import roadguardRouter from "./roadguard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(roadguardRouter);

export default router;
