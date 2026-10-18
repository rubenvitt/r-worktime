import { z } from "zod";
import { MAX_DRAFT_NOTE_LENGTH } from "@/lib/vacation-planner";

const note = z
  .string()
  .trim()
  .max(
    MAX_DRAFT_NOTE_LENGTH,
    `Notiz höchstens ${MAX_DRAFT_NOTE_LENGTH} Zeichen`,
  )
  .transform((value) => value || null)
  .nullable()
  .optional();

export const draftCreateSchema = z.object({
  from: z.string(),
  to: z.string(),
  note,
});

export const draftUpdateSchema = z
  .object({ from: z.string().optional(), to: z.string().optional(), note })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "Keine Änderung angegeben",
  });
