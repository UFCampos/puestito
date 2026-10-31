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
  "ACCEPTED_WAITING_DEPOSIT",
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

