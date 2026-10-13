type SchemaErrors = Record<string, readonly { message: string }[]> | undefined;

/**
 * The first message from a form validated by a zod schema.
 *
 * Errors stay hidden until a field has been left or a submission was attempted,
 * so they do not appear while the user is still typing.
 *
 * @param state - The form state's error and interaction fields.
 * @returns The message to show, or an empty string.
 */
export function visibleFormError(state: {
  errors: readonly SchemaErrors[];
  isBlurred: boolean;
  submissionAttempts: number;
}) {
  if (!state.isBlurred && state.submissionAttempts === 0) return "";
  for (const error of state.errors)
    for (const issues of Object.values(error ?? {})) if (issues[0]) return issues[0].message;
  return "";
}
