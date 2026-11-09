// Self-contained and app-agnostic: it depends only on react, react-native and
// @vvedantb/native-ui, so it can move into native-ui unchanged. No Eva or
// Clerk imports here. The caller owns the verification call and its errors.
import { useEffect, useState, type ReactNode } from "react";
import { AuthScreen, FieldError } from "@vvedantb/native-ui/auth";
import { Button } from "@vvedantb/native-ui/button";
import { Input } from "@vvedantb/native-ui/primitives";

export type SecondFactorScreenProps = {
  title: string;
  description?: string;
  /** Digits in the code. Default 6. `null` takes any text, such as a backup code. */
  codeLength?: number | null;
  /** Called with the full code. A rejected promise is the caller's to handle. */
  onSubmit: (code: string) => Promise<void> | void;
  /** Inline error under the field, such as "Incorrect code". */
  error?: string;
  /** Shows the Verify spinner and blocks a second submit. */
  loading?: boolean;
  /** Shows a ghost back button when set. */
  onBack?: () => void;
  /** Default "Back". */
  backLabel?: string;
  /** Above the title. App brand chrome goes here. */
  header?: ReactNode;
  /** Shows a Resend button, off for `resendCooldownSeconds` after each send and at mount. */
  onResend?: () => void;
  /** Default 30. */
  resendCooldownSeconds?: number;
  /** Other ways to verify. Shows a ghost button for each. */
  alternatives?: { key: string; label: string }[];
  onSelectAlternative?: (key: string) => void;
  /** Prefix for every `testID`. Default "second-factor". */
  testIDPrefix?: string;
};

/** A one-time code step: digits only, a Verify button, an inline error and a back link. */
export function SecondFactorScreen({
  title,
  description,
  codeLength = 6,
  onSubmit,
  error,
  loading = false,
  onBack,
  backLabel = "Back",
  header,
  onResend,
  resendCooldownSeconds = 30,
  alternatives,
  onSelectAlternative,
  testIDPrefix = "second-factor",
}: SecondFactorScreenProps) {
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(resendCooldownSeconds);
  const digitsOnly = codeLength !== null;
  const ready = (digitsOnly ? code.length === codeLength : code.trim().length > 0) && !loading;

  // Timer tick for the resend cooldown: must live outside the press handler.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const resend = () => {
    setSecondsLeft(resendCooldownSeconds);
    onResend?.();
  };

  const submit = () => {
    if (ready) void onSubmit(code);
  };

  return (
    <AuthScreen testID={`${testIDPrefix}-screen`} title={title} subtitle={description} header={header}>
      <Input
        testID={`${testIDPrefix}-code`}
        accessibilityLabel="Verification code"
        value={code}
        placeholder={digitsOnly ? "0".repeat(codeLength) : "Code"}
        keyboardType={digitsOnly ? "number-pad" : "default"}
        autoCapitalize="none"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={digitsOnly ? codeLength : undefined}
        autoFocus
        returnKeyType="go"
        onChangeText={(text) => setCode(digitsOnly ? text.replace(/\D/g, "") : text)}
        onSubmitEditing={submit}
      />
      <FieldError testID={`${testIDPrefix}-error`} message={error} />
      <Button testID={`${testIDPrefix}-verify`} loading={loading} disabled={!ready} onPress={submit}>
        Verify
      </Button>
      {onResend ? (
        <Button
          testID={`${testIDPrefix}-resend`}
          variant="ghost"
          disabled={secondsLeft > 0 || loading}
          onPress={resend}
        >
          {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : "Resend code"}
        </Button>
      ) : null}
      {alternatives?.map((alternative) => (
        <Button
          key={alternative.key}
          testID={`${testIDPrefix}-alt-${alternative.key}`}
          variant="ghost"
          onPress={() => onSelectAlternative?.(alternative.key)}
        >
          {alternative.label}
        </Button>
      ))}
      {onBack ? (
        <Button testID={`${testIDPrefix}-back`} variant="ghost" onPress={onBack}>
          {backLabel}
        </Button>
      ) : null}
    </AuthScreen>
  );
}
