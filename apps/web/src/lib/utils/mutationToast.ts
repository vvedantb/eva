import { toast } from "@vvedantb/ui";

/** Deduped success toast for a user-initiated mutation. */
export function mutationSuccess(message: string, id: string): void {
  toast.success(message, { id });
}

/** Deduped error toast for a user-initiated mutation. */
export function mutationError(message: string, id: string): void {
  toast.error(message, { id });
}

/** Toast success/error around a promise; rethrows after showing the error toast. */
export function withMutationToast<T>(
  promise: Promise<T>,
  success: string,
  error: string,
  id: string,
): Promise<T> {
  return promise
    .then((value) => {
      mutationSuccess(success, id);
      return value;
    })
    .catch((err) => {
      mutationError(error, id);
      throw err;
    });
}

/** Error toast only — for optimistic toggles that already update in place. */
export function catchMutationError<T>(
  promise: Promise<T>,
  error: string,
  id: string,
): Promise<T> {
  return promise.catch((err) => {
    mutationError(error, id);
    throw err;
  });
}
