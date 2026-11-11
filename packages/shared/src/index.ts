import { z } from "zod";

export const UserRoleSchema = z.enum(["BUYER", "ARTIST", "ADMIN"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const CommissionPaymentPlanSchema = z.enum([
  "FULL_100",
  "SPLIT_ON_SKETCH",
  "SPLIT_ON_FINAL_PREVIEW"
]);
export type CommissionPaymentPlan = z.infer<typeof CommissionPaymentPlanSchema>;

export const CommissionRatingSchema = z.enum(["SFW", "SUGGESTIVE", "NSFW"]);
export type CommissionRating = z.infer<typeof CommissionRatingSchema>;

export const WatermarkModeSchema = z.enum(["MANUAL", "AUTO_TEXT", "AUTO_AVATAR"]);
export type WatermarkMode = z.infer<typeof WatermarkModeSchema>;

export const CommissionOrderStatusSchema = z.enum([
  "REQUESTED",
  "REJECTED",
  "ACCEPTED_WAITING_DEPOSIT",
  "EXPIRED",
  "IN_PROGRESS_SKETCH",
  "SKETCH_REVIEW",
  "WAITING_PAYMENT_AFTER_SKETCH",
  "WORKING_FINAL",
  "FINAL_PREVIEW_REVIEW",
  "WAITING_PAYMENT_BEFORE_HD",
  "COMPLETED_HD_UNLOCKED",
  "CANCELLED"
]);
export type CommissionOrderStatus = z.infer<typeof CommissionOrderStatusSchema>;


export const MilestoneStageSchema = z.enum(["FULL_100", "DEPOSIT_50", "FINAL_50"]);
export type MilestoneStage = z.infer<typeof MilestoneStageSchema>;
