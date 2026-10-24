import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageAction,
  MessageActionsBar,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
  MessageToolbar,
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@vvedantb/ui";
import {
  IconCopy,
  IconMessageCircle,
  IconMicrophone,
  IconRefresh,
  IconThumbDown,
  IconThumbUp,
  IconWorld,
} from "@tabler/icons-react";
import { AiChatParts, SAMPLE_ATTACHMENTS } from "./AiChatParts";
import { GalleryGroup, GalleryItem } from "./GalleryItem";

const noop = () => {};

const MESSAGES = [
  { id: "m1", role: "user", content: "Can you add a dark mode toggle?" },
  {
    id: "m2",
    role: "assistant",
    content:
      "Sure. I will add a toggle to the settings page and store the choice in the user profile.",
  },
  { id: "m3", role: "user", content: "Use the existing Switch component." },
] as const;

function SampleMessageActions() {
  return (
    <MessageActionsBar>
      <MessageAction label="Copy">
        <IconCopy className="size-4" />
      </MessageAction>
      <MessageAction tooltip="Retry">
        <IconRefresh className="size-4" />
      </MessageAction>
      <MessageAction label="Like">
        <IconThumbUp className="size-4" />
      </MessageAction>
      <MessageAction label="Dislike">
        <IconThumbDown className="size-4" />
      </MessageAction>
    </MessageActionsBar>
  );
}

function ConversationSample() {
  return (
    <Conversation className="h-[420px] w-[36rem] rounded-surface bg-card">
      <ConversationContent className="pt-14">
        {MESSAGES.map((message) => (
          <Message from={message.role} key={message.id}>
            <MessageContent>{message.content}</MessageContent>
          </Message>
        ))}
        <Message from="assistant">
          <MessageContent>
            Done. The toggle uses Switch and writes to the profile on change.
          </MessageContent>
          <SampleMessageActions />
        </Message>
      </ConversationContent>
      <ConversationDownload messages={[...MESSAGES]} />
      <ConversationScrollButton />
    </Conversation>
  );
}

function BranchSample() {
  return (
    <MessageBranch defaultBranch={1} className="w-[32rem]">
      <MessageBranchContent>
        <Message from="assistant" key="b1">
          <MessageContent>First answer: use a Switch.</MessageContent>
        </Message>
        <Message from="assistant" key="b2">
          <MessageContent>
            Second answer: use a segmented control.
          </MessageContent>
        </Message>
        <Message from="assistant" key="b3">
          <MessageContent>Third answer: follow the OS setting.</MessageContent>
        </Message>
      </MessageBranchContent>
      <MessageToolbar>
        <MessageBranchSelector>
          <MessageBranchPrevious />
          <MessageBranchPage />
          <MessageBranchNext />
        </MessageBranchSelector>
        <SampleMessageActions />
      </MessageToolbar>
    </MessageBranch>
  );
}

function PromptInputSample({
  status,
  withAttachments,
}: {
  status?: "submitted" | "streaming" | "error";
  withAttachments?: boolean;
}) {
  return (
    <PromptInput onSubmit={noop} className="w-[36rem]">
      {withAttachments ? (
        <PromptInputHeader>
          <Attachments variant="inline">
            {SAMPLE_ATTACHMENTS.map((data) => (
              <Attachment data={data} key={data.id} onRemove={noop}>
                <AttachmentPreview />
                <AttachmentInfo />
                <AttachmentRemove />
              </Attachment>
            ))}
          </Attachments>
        </PromptInputHeader>
      ) : null}
      <PromptInputBody>
        <PromptInputTextarea
          defaultValue={
            withAttachments ? "Fix the layout in this screenshot" : undefined
          }
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger />
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments />
              <PromptInputActionMenuItem>Paste link</PromptInputActionMenuItem>
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
          <PromptInputButton tooltip="Dictate">
            <IconMicrophone className="size-4" />
          </PromptInputButton>
          <PromptInputButton>
            <IconWorld className="size-4" />
            <span>Search</span>
          </PromptInputButton>
        </PromptInputTools>
        <PromptInputSubmit status={status} />
      </PromptInputFooter>
    </PromptInput>
  );
}

export function AiChatSection() {
  return (
    <>
      <GalleryGroup title="Conversation / Message">
        <GalleryItem label="Conversation + Message (user/assistant) + MessageActions + ConversationDownload">
          <ConversationSample />
        </GalleryItem>
        <GalleryItem label="MessageBranch (2 of 3) + MessageToolbar">
          <BranchSample />
        </GalleryItem>
        <GalleryItem label="ConversationEmptyState" className="w-80">
          <div className="h-48 rounded-surface bg-card">
            <ConversationEmptyState
              icon={<IconMessageCircle className="size-6" />}
            />
          </div>
        </GalleryItem>
      </GalleryGroup>

      <GalleryGroup title="PromptInput">
        <GalleryItem label="PromptInput (header attachments, tools, select, submit ready)">
          <PromptInputSample withAttachments />
        </GalleryItem>
        <GalleryItem label="PromptInput empty (placeholder)">
          <PromptInputSample />
        </GalleryItem>
        <GalleryItem label="PromptInputSubmit status=submitted">
          <PromptInputSample status="submitted" />
        </GalleryItem>
        <GalleryItem label="PromptInputSubmit status=streaming">
          <PromptInputSample status="streaming" />
        </GalleryItem>
        <GalleryItem label="PromptInputSubmit status=error">
          <PromptInputSample status="error" />
        </GalleryItem>
      </GalleryGroup>

      <AiChatParts />
    </>
  );
}
