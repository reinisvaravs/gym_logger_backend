import { Router } from "express";

const router = Router();

router.get("/me", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "You must be logged in",
    });
  }

  return res.status(200).json({
    userId: req.session.userId,
  });
});

export default router;
