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
  /** Digits in the code. Default 6. */
  codeLength?: number;
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
  testIDPrefix = "second-factor",
}: SecondFactorScreenProps) {
  const [code, setCode] = useState("");
  const ready = code.length === codeLength && !loading;

  const submit = () => {
    if (ready) void onSubmit(code);
  };

  return (
    <AuthScreen testID={`${testIDPrefix}-screen`} title={title} subtitle={description} header={header}>
      <Input
        testID={`${testIDPrefix}-code`}
        accessibilityLabel="Verification code"
        value={code}
        placeholder={"0".repeat(codeLength)}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={codeLength}
        autoFocus
        returnKeyType="go"
        onChangeText={(text) => setCode(text.replace(/\D/g, ""))}
        onSubmitEditing={submit}
      />
      <FieldError testID={`${testIDPrefix}-error`} message={error} />
      <Button testID={`${testIDPrefix}-verify`} loading={loading} disabled={!ready} onPress={submit}>
        Verify
      </Button>
      {onBack ? (
        <Button testID={`${testIDPrefix}-back`} variant="ghost" onPress={onBack}>
          {backLabel}
        </Button>
      ) : null}
    </AuthScreen>
  );
}
