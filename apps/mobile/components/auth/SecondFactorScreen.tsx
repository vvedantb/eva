// Self-contained and app-agnostic: it depends only on react, react-native and
// @vvedantb/native-ui, so it can move into native-ui unchanged. No Eva or
// Clerk imports here. The caller owns the verification call and its errors.
import { useState, type ReactNode } from "react";
import { AuthScreen, FieldError } from "@vvedantb/native-ui/auth";
import { Button } from "@vvedantb/native-ui/button";
import { Input } from "@vvedantb/native-ui/primitives";

export type SecondFactorScreenProps = {
  title: string;
  description?: string;
  /** Digits in the code. Default 6. Used only when `numeric` is true. */
  codeLength?: number;
  /** Digits only (authenticator, SMS, email). False for backup codes: any text. Default true. */
  numeric?: boolean;
  /** Called with the full code. A rejected promise is the caller's to handle. */
  onSubmit: (code: string) => Promise<void> | void;
  /** Inline error under the field, such as "Incorrect code". */
  error?: string;
  /** Shows the Verify spinner and blocks a second submit. */
  loading?: boolean;
  /** Shows a Resend button when set (SMS and email only). */
  onResend?: () => void;
  /** Seconds left before Resend works again. Above 0 disables it and shows the count. */
  resendSeconds?: number;
  /** Shows a ghost back button when set. */
  onBack?: () => void;
  /** Default "Back". */
  backLabel?: string;
  /** Above the title. App brand chrome goes here. */
  header?: ReactNode;
  /** Prefix for every `testID`. Default "second-factor". */
  testIDPrefix?: string;
};

/** A one-time code step: a code field, a Verify button, an optional Resend, an inline error and a back link. */
export function SecondFactorScreen({
  title,
  description,
  codeLength = 6,
  numeric = true,
  onSubmit,
  error,
  loading = false,
  onResend,
  resendSeconds = 0,
  onBack,
  backLabel = "Back",
  header,
  testIDPrefix = "second-factor",
}: SecondFactorScreenProps) {
  const [code, setCode] = useState("");
  const ready = (numeric ? code.length === codeLength : code.trim().length > 0) && !loading;

  const submit = () => {
    if (ready) void onSubmit(code);
  };

  return (
    <AuthScreen testID={`${testIDPrefix}-screen`} title={title} subtitle={description} header={header}>
      <Input
        testID={`${testIDPrefix}-code`}
        accessibilityLabel="Verification code"
        value={code}
        placeholder={numeric ? "0".repeat(codeLength) : "Backup code"}
        keyboardType={numeric ? "number-pad" : "default"}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={numeric ? "one-time-code" : "off"}
        textContentType={numeric ? "oneTimeCode" : "none"}
        maxLength={numeric ? codeLength : undefined}
        autoFocus
        returnKeyType="go"
        onChangeText={(text) => setCode(numeric ? text.replace(/\D/g, "") : text.trim())}
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
          disabled={resendSeconds > 0 || loading}
          onPress={onResend}
        >
          {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend"}
        </Button>
      ) : null}
      {onBack ? (
        <Button testID={`${testIDPrefix}-back`} variant="ghost" onPress={onBack}>
          {backLabel}
        </Button>
      ) : null}
    </AuthScreen>
  );
}
