import { useState } from "react";
import { Text } from "react-native";
import { useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { AuthScreen, FieldError, GoogleSignInButton, OrDivider } from "@vvedantb/native-ui/auth";
import { Button } from "@vvedantb/native-ui/button";
import { Input } from "@vvedantb/native-ui/primitives";
import { SecondFactorScreen } from "../../components/auth/SecondFactorScreen";
import { SSO_PATH, SSO_SCHEME } from "@/config";
import {
  sendCode,
  SIGN_IN_MESSAGES,
  startSignIn,
  submitCode,
  submitNewPassword,
  type CodeStrategy,
  type Outcome,
  type SetActive,
  type SignInLike,
  type SignInStep,
} from "@/auth/signInFlow";
import { EvaMark } from "@/ui/EvaMark";
import { textColor, useScheme } from "@/ui/theme";

type Pending = { signIn: SignInLike; step: Exclude<SignInStep, { kind: "complete" | "unsupported" }>; notice?: string };

const CODE_COPY: Record<CodeStrategy, { title: string; description: string; switchLabel: string }> = {
  totp: {
    title: "Two-step verification",
    description: "Enter the 6-digit code from your authenticator app.",
    switchLabel: "Use your authenticator app",
  },
  email_code: { title: "Check your email", description: "Enter the code we sent to your email.", switchLabel: "Email me a code" },
  phone_code: { title: "Check your phone", description: "Enter the code we sent by text message.", switchLabel: "Text me a code" },
  backup_code: { title: "Backup code", description: "Enter one of your backup codes.", switchLabel: "Use a backup code" },
};

/** The web sign-in (Clerk's modal on the landing page): the Eva mark and its copy. */
export default function SignIn() {
  const { signIn, setActive } = useSignIn();
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");

  if (!signIn || !setActive) return null;

  // Moves to the next step: home, another screen, or the web fallback.
  const handle = (outcome: Outcome, notice?: string) => {
    if (!outcome.ok) return setError(outcome.error);
    const { step } = outcome;
    if (step.kind === "complete") return router.replace("/");
    if (step.kind === "unsupported") {
      setPending(null);
      return setError(SIGN_IN_MESSAGES.needsAnotherStep);
    }
    setError("");
    setPending({ signIn: outcome.signIn, step, notice });
  };

  if (pending?.step.kind === "new_password") {
    return (
      <NewPasswordScreen
        signIn={pending.signIn}
        setActive={setActive}
        onOutcome={handle}
        onBack={() => setPending(null)}
      />
    );
  }

  if (pending?.step.kind === "code") {
    return (
      <CodeStep
        signIn={pending.signIn}
        setActive={setActive}
        phase={pending.step.phase}
        factors={pending.step.factors}
        notice={pending.notice}
        onOutcome={handle}
        onBack={() => setPending(null)}
      />
    );
  }

  return (
    <PasswordForm
      error={error}
      setError={setError}
      onSubmit={async (identifier, password) => {
        const outcome = await startSignIn({ signIn, setActive, identifier, password });
        // Send the first code before the code screen opens, so its resend timer matches.
        if (outcome.ok && outcome.step.kind === "code") {
          const first = outcome.step.factors[0];
          const sent = first ? await sendCode({ signIn: outcome.signIn, phase: outcome.step.phase, factor: first }) : { ok: true as const };
          return handle(outcome, sent.ok ? undefined : sent.error);
        }
        handle(outcome);
      }}
    />
  );
}

function PasswordForm({
  error,
  setError,
  onSubmit,
}: {
  error: string;
  setError: (message: string) => void;
  onSubmit: (identifier: string, password: string) => Promise<void>;
}) {
  const router = useRouter();
  const scheme = useScheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    if (!email || !password) return setError("Enter your email and password");
    setSubmitting(true);
    setError("");
    await onSubmit(email, password);
    setSubmitting(false);
  };

  return (
    <AuthScreen
      testID="sign-in-screen"
      title="Sign in to Eva"
      subtitle="Welcome back! Please sign in to continue"
      header={<EvaMark size={40} />}
      footer={
        <>
          <Text className="font-instrument-sans text-sm" style={textColor(scheme, "muted")}>
            Don't have an account?
          </Text>
          <Button testID="sign-in-sign-up-link" variant="link" size="sm" fullWidth={false} onPress={() => router.push("/sign-up")}>
            Sign up
          </Button>
        </>
      }
    >
      <GoogleSignInButton
        testID="sign-in-google"
        scheme={SSO_SCHEME}
        redirectPath={SSO_PATH}
        label="Continue with Google"
        onError={setError}
        disabled={submitting}
      />
      <OrDivider />
      <Input
        testID="sign-in-email"
        accessibilityLabel="Email"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        returnKeyType="next"
        value={email}
        placeholder="Email"
        onChangeText={setEmail}
      />
      <Input
        testID="sign-in-password"
        accessibilityLabel="Password"
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
        secureTextEntry
        returnKeyType="go"
        value={password}
        placeholder="Password"
        onChangeText={setPassword}
        onSubmitEditing={() => void submit()}
      />
      <FieldError testID="sign-in-error" message={error} />
      <Button testID="sign-in-submit" loading={submitting} onPress={() => void submit()}>
        Sign in
      </Button>
    </AuthScreen>
  );
}

function CodeStep({
  signIn,
  setActive,
  phase,
  factors,
  notice,
  onOutcome,
  onBack,
}: {
  signIn: SignInLike;
  setActive: SetActive;
  phase: "first" | "second";
  factors: { strategy: CodeStrategy; emailAddressId?: string; phoneNumberId?: string }[];
  notice?: string;
  onOutcome: (outcome: Outcome) => void;
  onBack: () => void;
}) {
  const [strategy, setStrategy] = useState<CodeStrategy | undefined>(factors[0]?.strategy);
  const [error, setError] = useState(notice ?? "");
  const [loading, setLoading] = useState(false);
  const factor = factors.find((f) => f.strategy === strategy) ?? factors[0];
  if (!factor) return null;
  const copy = CODE_COPY[factor.strategy];
  const sendsCode = factor.strategy === "email_code" || factor.strategy === "phone_code";

  const send = async () => {
    const sent = await sendCode({ signIn, phase, factor });
    setError(sent.ok ? "" : sent.error);
  };

  return (
    // The key restarts the resend timer and clears the code when the method changes.
    <SecondFactorScreen
      key={factor.strategy}
      header={<EvaMark size={40} />}
      title={copy.title}
      description={copy.description}
      codeLength={factor.strategy === "backup_code" ? null : 6}
      error={error}
      loading={loading}
      onSubmit={async (code) => {
        setLoading(true);
        setError("");
        const outcome = await submitCode({ signIn, setActive, phase, strategy: factor.strategy, code });
        setLoading(false);
        if (outcome.ok) onOutcome(outcome);
        else setError(outcome.error);
      }}
      onResend={sendsCode ? () => void send() : undefined}
      alternatives={factors.filter((f) => f !== factor).map((f) => ({ key: f.strategy, label: CODE_COPY[f.strategy].switchLabel }))}
      onSelectAlternative={(key) => {
        const next = factors.find((f) => f.strategy === key);
        if (!next) return;
        setStrategy(next.strategy);
        setError("");
        if (next.strategy === "email_code" || next.strategy === "phone_code") {
          void sendCode({ signIn, phase, factor: next }).then((sent) => setError(sent.ok ? "" : sent.error));
        }
      }}
      onBack={onBack}
      backLabel="Back to sign in"
    />
  );
}

function NewPasswordScreen({
  signIn,
  setActive,
  onOutcome,
  onBack,
}: {
  signIn: SignInLike;
  setActive: SetActive;
  onOutcome: (outcome: Outcome) => void;
  onBack: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading || !password) return;
    setLoading(true);
    setError("");
    const outcome = await submitNewPassword({ signIn, setActive, password });
    setLoading(false);
    if (outcome.ok) onOutcome(outcome);
    else setError(outcome.error);
  };

  return (
    <AuthScreen
      testID="new-password-screen"
      title="Set a new password"
      subtitle="Your password must change before you can sign in."
      header={<EvaMark size={40} />}
    >
      <Input
        testID="new-password-input"
        accessibilityLabel="New password"
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry
        autoFocus
        returnKeyType="go"
        value={password}
        placeholder="New password"
        onChangeText={setPassword}
        onSubmitEditing={() => void submit()}
      />
      <FieldError testID="new-password-error" message={error} />
      <Button testID="new-password-submit" loading={loading} disabled={!password} onPress={() => void submit()}>
        Set password
      </Button>
      <Button testID="new-password-back" variant="ghost" onPress={onBack}>
        Back to sign in
      </Button>
    </AuthScreen>
  );
}
