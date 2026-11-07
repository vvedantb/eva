import { buildStructuredAnswer, type ParsedQuestion } from "@eva/shared/pendingQuestion";
import { Button } from "@vvedantb/native-ui/button";
import { Chip, Input, Text } from "@vvedantb/native-ui/primitives";
import { useState } from "react";
import { View } from "react-native";
import { textColor, useScheme } from "@/ui/theme";

/**
 * The agent's blocking question, in place of the composer as on the web
 * (`ChatQuestionDock` + `MultipleChoiceQuestion`). One question at a time:
 * pick option chips, or type an answer, which wins over the chips as the
 * web's "Other" does.
 */
export function QuestionDock({
  questions,
  onSubmit,
}: {
  questions: ParsedQuestion[];
  onSubmit: (answers: Record<string, string>) => Promise<void>;
}) {
  const scheme = useScheme();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Record<number, string[]>>({});
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [sending, setSending] = useState(false);
  const question = questions[step];
  if (!question) return null;

  const selected = picked[step] ?? [];
  const typedNow = (typed[step] ?? "").trim();
  const isLast = step === questions.length - 1;

  const toggle = (label: string) => {
    const next = question.multiSelect
      ? selected.includes(label)
        ? selected.filter((item) => item !== label)
        : [...selected, label]
      : [label];
    setPicked({ ...picked, [step]: next });
    setTyped({ ...typed, [step]: "" });
  };

  const handleNext = async () => {
    if (!isLast) {
      setStep(step + 1);
      return;
    }
    setSending(true);
    try {
      await onSubmit(
        buildStructuredAnswer(questions, (_, index) => {
          const custom = (typed[index] ?? "").trim();
          return custom ? [custom] : (picked[index] ?? []);
        }),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="gap-3 px-4 pb-6 pt-3">
      <Text variant="muted" style={textColor(scheme, "muted")}>
        {questions.length > 1 ? `${question.header} · ${step + 1} of ${questions.length}` : question.header}
      </Text>
      <Text variant="large" style={textColor(scheme)}>
        {question.question}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {question.options.map((option) => (
          <Chip
            key={option.label}
            label={option.label}
            selected={typedNow === "" && selected.includes(option.label)}
            onPress={() => toggle(option.label)}
          />
        ))}
      </View>
      <Input
        value={typed[step] ?? ""}
        onChangeText={(text) => setTyped({ ...typed, [step]: text })}
        placeholder="Type your answer..."
      />
      <Button
        size="sm"
        disabled={selected.length === 0 && typedNow === ""}
        loading={sending}
        onPress={() => void handleNext()}
      >
        {isLast ? "Answer" : "Next"}
      </Button>
    </View>
  );
}
