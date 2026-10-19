import { z } from "zod";

const required = z.string().trim().min(1, "שדה חובה").max(200, "עד 200 תווים");
export const orderSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z
    .number()
    .int()
    .min(1, "הכמות חייבת להיות בין 1 ל־100")
    .max(100, "הכמות חייבת להיות בין 1 ל־100"),
  first_name: required,
  last_name: required,
  street_address: required,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .email("יש להזין כתובת אימייל תקינה")
    .refine(
      (v) => v.split("@")[1] === "gmail.com",
      "יש להשתמש בכתובת Gmail בלבד",
    ),
  phone: z
    .string()
    .regex(/^[0-9]{10}$/, "יש להזין בדיוק 10 ספרות, ללא רווחים או מקפים"),
});
export const statusSchema = z.enum(["new", "in_progress", "completed"]);
export const statusLabels = {
  new: "חדשה",
  in_progress: "בטיפול",
  completed: "הושלמה",
};
export type OrderInput = z.infer<typeof orderSchema>;
export type Product = {
  id: number;
  name: string;
  description: string;
  price_agorot: number;
  image_path: string;
};
export const money = (agorot: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(agorot / 100);
