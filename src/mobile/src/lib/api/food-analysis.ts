import { z } from 'zod';

import { apiRequest } from '@/lib/api/client';
import { nutritionEntrySchema, quantityModeSchema, type MealType, type NutritionItemInput } from '@/lib/api/nutrition';

export const foodAnalysisStatusSchema = z.enum(['PendingConfirmation', 'Confirmed', 'Discarded']);
export const foodAnalysisOutcomeSchema = z.enum(['Success', 'InsufficientInformation', 'NoFoodDetected']);
export const foodAnalysisBasisSchema = z.enum(['PicturedPortion', 'Per100Grams']);

export type FoodAnalysisStatus = z.infer<typeof foodAnalysisStatusSchema>;
export type FoodAnalysisOutcome = z.infer<typeof foodAnalysisOutcomeSchema>;
export type FoodAnalysisBasis = z.infer<typeof foodAnalysisBasisSchema>;

/**
 * One estimated food. The `estimate*` fields are what the model said, on its own basis; the `suggested*` fields
 * are the same food expressed as meal-entry input. A missing nutrient stays null — the review screen asks for
 * it rather than showing a zero nobody entered.
 */
export const foodAnalysisItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  portionDescription: z.string().nullable(),
  estimatedGrams: z.number().nullable(),
  basis: foodAnalysisBasisSchema,
  energyKcal: z.number().nullable(),
  proteinGrams: z.number().nullable(),
  carbGrams: z.number().nullable(),
  fatGrams: z.number().nullable(),
  confidence: z.number().nullable(),
  position: z.number(),
  suggestedQuantityMode: quantityModeSchema,
  suggestedQuantity: z.number(),
  suggestedEnergyKcalPerUnit: z.number().nullable(),
  suggestedProteinGramsPerUnit: z.number().nullable(),
  suggestedCarbGramsPerUnit: z.number().nullable(),
  suggestedFatGramsPerUnit: z.number().nullable(),
  isComplete: z.boolean(),
});

export const foodAnalysisDraftSchema = z.object({
  id: z.string(),
  status: foodAnalysisStatusSchema,
  outcome: foodAnalysisOutcomeSchema,
  schemaVersion: z.string(),
  model: z.string(),
  notes: z.string().nullable(),
  confidence: z.number().nullable(),
  imageId: z.string(),
  hasImage: z.boolean(),
  createdAtUtc: z.string(),
  expiresAtUtc: z.string(),
  isExpired: z.boolean(),
  confirmedEntryId: z.string().nullable(),
  items: z.array(foodAnalysisItemSchema),
});

export type FoodAnalysisItem = z.infer<typeof foodAnalysisItemSchema>;
export type FoodAnalysisDraft = z.infer<typeof foodAnalysisDraftSchema>;

/** A picked picture, before it is uploaded. */
export interface PickedPhoto {
  uri: string;
  /** Web only: the picked bytes, which FormData can send directly. */
  blob?: Blob;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface ConfirmFoodAnalysisInput {
  mealType: MealType;
  consumedAtUtc: string;
  note: string | null;
  items: NutritionItemInput[];
}

const auth = { auth: true } as const;

/** Builds the multipart body. Web sends the blob; native sends the file descriptor React Native understands. */
function photoForm(photo: PickedPhoto): FormData {
  const form = new FormData();
  if (photo.blob) {
    form.append('photo', photo.blob, photo.fileName);
  } else {
    form.append('photo', { uri: photo.uri, name: photo.fileName, type: photo.mimeType } as unknown as Blob);
  }
  return form;
}

export const foodAnalysisApi = {
  /**
   * Uploads one photo and returns the draft it produced. The same `clientRequestId` on a retry returns the
   * first draft instead of paying for a second analysis.
   */
  analyze: (photo: PickedPhoto, clientRequestId: string, signal?: AbortSignal) =>
    apiRequest(`/api/nutrition/food-analysis?clientRequestId=${encodeURIComponent(clientRequestId)}`, {
      ...auth,
      method: 'POST',
      body: photoForm(photo),
      schema: foodAnalysisDraftSchema,
      signal,
    }),

  get: (id: string, signal?: AbortSignal) =>
    apiRequest(`/api/nutrition/food-analysis/${id}`, { ...auth, schema: foodAnalysisDraftSchema, signal }),

  /** Writes the meal the user reviewed. This is the only call in the flow that changes the diary. */
  confirm: (id: string, input: ConfirmFoodAnalysisInput, clientRequestId: string) =>
    apiRequest(`/api/nutrition/food-analysis/${id}/confirm`, {
      ...auth,
      method: 'POST',
      body: { ...input, clientRequestId },
      schema: nutritionEntrySchema,
    }),

  discard: (id: string) => apiRequest(`/api/nutrition/food-analysis/${id}`, { ...auth, method: 'DELETE' }),
};
