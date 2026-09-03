import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as adminProgramsService from "./adminPrograms.service";
import {
  createExerciseSchema,
  createProgramSchema,
  createRecipeSchema,
  listContentReviewsQuerySchema,
  listExercisesQuerySchema,
  listProgramsQuerySchema,
  listRecipesQuerySchema,
  reviewContentReviewSchema,
  updateExerciseSchema,
  updateProgramSchema,
  updateRecipeSchema,
} from "./adminPrograms.schema";

export const adminProgramsRouter = Router();

// ---- Programs (05.01) ------------------------------------------------------

adminProgramsRouter.get(
  "/admin/programs",
  requireAdminAuth,
  requirePermission("programs", "view"),
  async (req, res, next) => {
  try {
    const query = listProgramsQuerySchema.parse(req.query);
    res.status(200).json(await adminProgramsService.listPrograms(query));
  } catch (err) {
    next(err);
  }
});

adminProgramsRouter.post(
  "/admin/programs",
  requireAdminAuth,
  requirePermission("programs", "create"),
  async (req: AdminAuthedRequest, res, next) => {
  try {
    const input = createProgramSchema.parse(req.body);
    const program = await adminProgramsService.createProgram(req.adminUserId as string, input);
    res.status(201).json({ program });
  } catch (err) {
    next(err);
  }
});

adminProgramsRouter.patch(
  "/admin/programs/:id",
  requireAdminAuth,
  requirePermission("programs", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
  try {
    const input = updateProgramSchema.parse(req.body);
    const program = await adminProgramsService.updateProgram(req.adminUserId as string, req.params.id, input);
    res.status(200).json({ program });
  } catch (err) {
    next(err);
  }
});

adminProgramsRouter.post(
  "/admin/programs/:id/publish",
  requireAdminAuth,
  requirePermission("programs", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
  try {
    const program = await adminProgramsService.publishProgram(req.adminUserId as string, req.params.id);
    res.status(200).json({ program });
  } catch (err) {
    next(err);
  }
});

adminProgramsRouter.post(
  "/admin/programs/:id/unpublish",
  requireAdminAuth,
  requirePermission("programs", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
  try {
    const program = await adminProgramsService.unpublishProgram(req.adminUserId as string, req.params.id);
    res.status(200).json({ program });
  } catch (err) {
    next(err);
  }
});

adminProgramsRouter.post(
  "/admin/programs/:id/submit-review",
  requireAdminAuth,
  requirePermission("programs", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const result = await adminProgramsService.submitProgramForReview(req.adminUserId as string, req.params.id);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ---- Exercises (05.02) -----------------------------------------------------

adminProgramsRouter.get(
  "/admin/exercises",
  requireAdminAuth,
  requirePermission("programs", "view"),
  async (req, res, next) => {
  try {
    const query = listExercisesQuerySchema.parse(req.query);
    res.status(200).json(await adminProgramsService.listExercises(query));
  } catch (err) {
    next(err);
  }
});

adminProgramsRouter.post(
  "/admin/exercises",
  requireAdminAuth,
  requirePermission("programs", "create"),
  async (req: AdminAuthedRequest, res, next) => {
  try {
    const input = createExerciseSchema.parse(req.body);
    const exercise = await adminProgramsService.createExercise(req.adminUserId as string, input);
    res.status(201).json({ exercise });
  } catch (err) {
    next(err);
  }
});

adminProgramsRouter.patch(
  "/admin/exercises/:id",
  requireAdminAuth,
  requirePermission("programs", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
  try {
    const input = updateExerciseSchema.parse(req.body);
    const exercise = await adminProgramsService.updateExercise(req.adminUserId as string, req.params.id, input);
    res.status(200).json({ exercise });
  } catch (err) {
    next(err);
  }
});

adminProgramsRouter.post(
  "/admin/exercises/:id/publish",
  requireAdminAuth,
  requirePermission("programs", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const exercise = await adminProgramsService.publishExercise(req.adminUserId as string, req.params.id);
      res.status(200).json({ exercise });
    } catch (err) {
      next(err);
    }
  },
);

adminProgramsRouter.post(
  "/admin/exercises/:id/unpublish",
  requireAdminAuth,
  requirePermission("programs", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const exercise = await adminProgramsService.unpublishExercise(req.adminUserId as string, req.params.id);
      res.status(200).json({ exercise });
    } catch (err) {
      next(err);
    }
  },
);

adminProgramsRouter.post(
  "/admin/exercises/:id/submit-review",
  requireAdminAuth,
  requirePermission("programs", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const result = await adminProgramsService.submitExerciseForReview(req.adminUserId as string, req.params.id);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ---- Recipes (05.03) --------------------------------------------------------

adminProgramsRouter.get(
  "/admin/recipes",
  requireAdminAuth,
  requirePermission("programs", "view"),
  async (req, res, next) => {
  try {
    const query = listRecipesQuerySchema.parse(req.query);
    res.status(200).json(await adminProgramsService.listRecipes(query));
  } catch (err) {
    next(err);
  }
});

adminProgramsRouter.post(
  "/admin/recipes",
  requireAdminAuth,
  requirePermission("programs", "create"),
  async (req: AdminAuthedRequest, res, next) => {
  try {
    const input = createRecipeSchema.parse(req.body);
    const recipe = await adminProgramsService.createRecipe(req.adminUserId as string, input);
    res.status(201).json({ recipe });
  } catch (err) {
    next(err);
  }
});

adminProgramsRouter.patch(
  "/admin/recipes/:id",
  requireAdminAuth,
  requirePermission("programs", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
  try {
    const input = updateRecipeSchema.parse(req.body);
    const recipe = await adminProgramsService.updateRecipe(req.adminUserId as string, req.params.id, input);
    res.status(200).json({ recipe });
  } catch (err) {
    next(err);
  }
});

adminProgramsRouter.post(
  "/admin/recipes/:id/publish",
  requireAdminAuth,
  requirePermission("programs", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const recipe = await adminProgramsService.publishRecipe(req.adminUserId as string, req.params.id);
      res.status(200).json({ recipe });
    } catch (err) {
      next(err);
    }
  },
);

adminProgramsRouter.post(
  "/admin/recipes/:id/unpublish",
  requireAdminAuth,
  requirePermission("programs", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const recipe = await adminProgramsService.unpublishRecipe(req.adminUserId as string, req.params.id);
      res.status(200).json({ recipe });
    } catch (err) {
      next(err);
    }
  },
);

adminProgramsRouter.post(
  "/admin/recipes/:id/submit-review",
  requireAdminAuth,
  requirePermission("programs", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const result = await adminProgramsService.submitRecipeForReview(req.adminUserId as string, req.params.id);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ---- Review / Approval (05.05) ---------------------------------------------
// A new top-level path, not nested under /admin/programs — no route-order
// concern with the :id routes above (see adminRelationships.routes.ts's own
// comment for where that concern DOES apply).

adminProgramsRouter.get(
  "/admin/content-reviews",
  requireAdminAuth,
  requirePermission("programs", "view"),
  async (req, res, next) => {
    try {
      const query = listContentReviewsQuerySchema.parse(req.query);
      res.status(200).json(await adminProgramsService.listContentReviews(query));
    } catch (err) {
      next(err);
    }
  },
);

adminProgramsRouter.post(
  "/admin/content-reviews/:id/approve",
  requireAdminAuth,
  requirePermission("programs", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = reviewContentReviewSchema.parse(req.body);
      const result = await adminProgramsService.approveContentReview(req.adminUserId as string, req.params.id, input);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminProgramsRouter.post(
  "/admin/content-reviews/:id/reject",
  requireAdminAuth,
  requirePermission("programs", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = reviewContentReviewSchema.parse(req.body);
      const result = await adminProgramsService.rejectContentReview(req.adminUserId as string, req.params.id, input);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);
