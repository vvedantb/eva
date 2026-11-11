import { api, type Id } from "@eva/backend";
import { REVIEW_EVENT_OPTIONS, canSubmitReview, verdictSuccessTitle, type ReviewEvent } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetRow,
  SheetTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction } from "convex/react";
import { useRef, useState } from "react";
import { Text, View, type TextInput } from "react-native";
import { usePendingLineComments } from "@/diff/prDiffStore";
import { useScheme, XS_TRACKING } from "@/ui/theme";

export type ComposerMode = "comment" | "review";

/** The web `text-xs` (12 / 16). */
const TEXT_XS = { fontSize: 12, lineHeight: 16, letterSpacing: XS_TRACKING };

/**
 * The web floating `PrComposer` as a bottom sheet: Comment (a conversation
 * comment, `github.addPrComment`) and, while the pull request is open, Review
 * (a summary and a verdict, `github.submitPrReview`), both posted as the eva
 * GitHub App. The drafts live here, so closing the sheet keeps them. A review
 * also carries the line comments drafted on Code (`usePendingLineComments`),
 * cleared once it is posted. The mode is the caller's, so the button that
 * opens the sheet can start it on Review while comments are pending, as the
 * web does. The field, verdicts and error scroll
 * when the keyboard leaves too little room, so the tabs and the post button
 * stay on screen.
 */
export function ReviewComposer({
  open,
  onOpenChange,
  mode,
  onModeChange,
  repoId,
  prNumber,
  isOpen,
  onPosted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  repoId: Id<"githubRepos">;
  prNumber: number;
  /** A closed or merged pull request still takes comments, but no verdict. */
  isOpen: boolean;
  onPosted: () => void;
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const addComment = useAction(api.github.addPrComment);
  const submitPrReview = useAction(api.github.submitPrReview);
  const pending = usePendingLineComments({ repoId, prNumber });
  // Every pending comment carries a GitHub anchor: the phone drafts them on the pull request diff only.
  const comments = pending.comments.map((comment) => ({
    path: comment.path,
    body: comment.body,
    line: comment.line,
    side: comment.side,
    startLine: comment.startLine,
    startSide: comment.startSide,
  }));
  const [commentBody, setCommentBody] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [event, setEvent] = useState<ReviewEvent>("COMMENT");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The field, focused once the sheet is on screen (`onShow`): focus is imperative.
  const field = useRef<TextInput>(null);
  const activeMode: ComposerMode = isOpen ? mode : "comment";
  const body = activeMode === "comment" ? commentBody : reviewBody;
  const trimmed = body.trim();
  const canPost = activeMode === "comment" ? trimmed.length > 0 : canSubmitReview(event, trimmed, comments.length);

  const done = () => {
    setPosting(false);
    onOpenChange(false);
    onPosted();
  };
  const fail = (fallback: string) => (cause: Error) => {
    setPosting(false);
    setError(cause.message || fallback);
  };
  const post = () => {
    if (!canPost || posting) return;
    setPosting(true);
    setError(null);
    if (activeMode === "comment") {
      addComment({ repoId, prNumber, body: trimmed }).then(() => {
        setCommentBody("");
        done();
      }, fail("Couldn't post the comment"));
      return;
    }
    submitPrReview({ repoId, prNumber, event, body: trimmed, comments }).then((result) => {
      setReviewBody("");
      pending.clear();
      toast.success(verdictSuccessTitle(result.state), {
        description:
          comments.length > 0
            ? `${comments.length} inline comment${comments.length === 1 ? "" : "s"} posted to GitHub.`
            : "Posted to GitHub as the eva app.",
      });
      done();
    }, fail("GitHub rejected the review."));
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Closing mid-post would hide the only progress the user sees.
        if (!posting) onOpenChange(next);
      }}
    >
      <SheetContent className="gap-3 px-4" onShow={() => field.current?.focus()}>
        <SheetHeader>
          {isOpen ? (
            <Tabs
              value={activeMode}
              onValueChange={(value: string) => {
                onModeChange(value === "review" ? "review" : "comment");
                setError(null);
              }}
            >
              <TabsList variant="segmented" size="sm" className="self-start">
                <TabsTrigger value="comment">Comment</TabsTrigger>
                <TabsTrigger value="review">Review</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : (
            <SheetTitle>Comment on pull request</SheetTitle>
          )}
        </SheetHeader>
        <SheetBody contentContainerClassName="gap-3">
          {activeMode === "review" ? (
            <Text style={[TEXT_XS, { color: muted }]}>
              {comments.length === 0
                ? "No line comments yet — tap lines in Code to add them."
                : `${comments.length} line comment${comments.length === 1 ? "" : "s"} will be posted with this review.`}
            </Text>
          ) : null}
          <Textarea
            ref={field}
            accessibilityLabel={activeMode === "comment" ? "Comment on this pull request" : "Review summary"}
            value={body}
            onChangeText={activeMode === "comment" ? setCommentBody : setReviewBody}
            placeholder={
              activeMode === "comment" ? "Leave a comment" : event === "REQUEST_CHANGES" ? "What has to change?" : "Leave a summary…"
            }
          />
          {activeMode === "review" ? (
            <View accessibilityRole="radiogroup" accessibilityLabel="Verdict">
              {REVIEW_EVENT_OPTIONS.map((option) => (
                <SheetRow
                  key={option.event}
                  title={option.label}
                  detail={option.hint}
                  active={event === option.event}
                  onPress={() => setEvent(option.event)}
                />
              ))}
            </View>
          ) : null}
          {error === null ? null : (
            <Text accessibilityRole="alert" style={[TEXT_XS, { color: EVA_THEME[scheme].destructive }]}>
              {error}
            </Text>
          )}
        </SheetBody>
        <View className="flex-row items-center justify-between gap-3">
          {/* eva authenticates as its GitHub App, so GitHub shows the app, not the reader. */}
          <Text className="min-w-0 shrink" style={[TEXT_XS, { color: muted }]}>
            Posted as the eva app.
          </Text>
          <Button fullWidth={false} loading={posting} disabled={!canPost || posting} onPress={post}>
            {activeMode === "comment" ? "Comment" : "Submit review"}
          </Button>
        </View>
      </SheetContent>
    </Sheet>
  );
}
