import { Router } from "express";
import { getTrainingTypesByUserId } from "../db/trainingTypes.js";

const router = Router();

router.get("/", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({
      message: "You must be logged in",
    });
  }

  try {
    const result = await getTrainingTypesByUserId(userId);

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Failed to get training types",
    });
  }
});

export default router;
