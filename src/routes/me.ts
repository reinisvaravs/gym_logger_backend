import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.get("/me", requireAuth, (req, res) => {
  return res.status(200).json({
    userId: req.session.userId,
  });
});

export default router;
