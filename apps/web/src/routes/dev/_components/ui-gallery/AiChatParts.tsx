import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
  Attachment,
  AttachmentEmpty,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
  CodeBlock,
  CodeBlockCopyButton,
  FileChip,
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
  Shimmer,
} from "@vvedantb/ui";
import type { AttachmentData, AttachmentVariant } from "@vvedantb/ui";
import {
  IconCopy,
  IconDownload,
  IconListCheck,
  IconPencil,
  IconShare,
  IconTrash,
} from "@tabler/icons-react";
import { GalleryGroup, GalleryItem } from "./GalleryItem";

/** Inline SVG so the image attachment needs no network and decodes the same every time. */
const SAMPLE_IMAGE_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#6366f1"/><circle cx="30" cy="30" r="14" fill="#fde68a"/><path d="M0 96 L40 52 L64 76 L80 60 L96 76 L96 96 Z" fill="#22c55e"/></svg>',
  );

export const SAMPLE_ATTACHMENTS: AttachmentData[] = [
  {
    id: "att-image",
    type: "file",
    filename: "screenshot.png",
    mediaType: "image/png",
    url: SAMPLE_IMAGE_URL,
  },
  {
    id: "att-doc",
    type: "file",
    filename: "requirements.pdf",
    mediaType: "application/pdf",
    url: "",
  },
  {
    id: "att-source",
    type: "source-document",
    sourceId: "src-1",
    title: "Router docs",
    mediaType: "text/html",
  },
];

const noop = () => {};

const SAMPLE_CODE = `export function add(a: number, b: number) {
  return a + b;
}`;

function AttachmentsSample({ variant }: { variant: AttachmentVariant }) {
  return (
    <Attachments variant={variant}>
      {SAMPLE_ATTACHMENTS.map((data) => (
        <Attachment data={data} key={data.id} onRemove={noop}>
          <AttachmentPreview />
          <AttachmentInfo showMediaType={variant === "list"} />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}

const QUEUE_ITEMS = [
  { id: "q1", text: "Add a dark theme toggle to settings", done: true },
  { id: "q2", text: "Write tests for the billing webhook", done: false },
  { id: "q3", text: "Update the changelog for the release", done: false },
];

export function QueueSample() {
  return (
    <Queue className="w-96">
      <QueueSection>
        <QueueSectionTrigger>
          <QueueSectionLabel
            count={QUEUE_ITEMS.length}
            label="queued"
            icon={<IconListCheck className="size-3.5" />}
          />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {QUEUE_ITEMS.map((item) => (
              <QueueItem key={item.id}>
                <div className="flex items-start gap-2">
                  <QueueItemIndicator completed={item.done} />
                  <QueueItemContent completed={item.done}>
                    {item.text}
                  </QueueItemContent>
                  <QueueItemActions>
                    <QueueItemAction aria-label="Edit">
                      <IconPencil className="size-3.5" />
                    </QueueItemAction>
                    <QueueItemAction aria-label="Remove">
                      <IconTrash className="size-3.5" />
                    </QueueItemAction>
                  </QueueItemActions>
                </div>
              </QueueItem>
            ))}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
      <QueueSection defaultOpen={false}>
        <QueueSectionTrigger>
          <QueueSectionLabel count={2} label="todos (closed)" />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            <QueueItem>Hidden item</QueueItem>
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
}

export function AiChatParts() {
  return (
    <>
      <GalleryGroup title="Queue / Shimmer / FileChip">
        <GalleryItem label="Queue (open + closed section)">
          <QueueSample />
        </GalleryItem>
        <GalleryItem label="Shimmer (default + span, duration 3)">
          <div className="flex flex-col gap-2">
            <Shimmer>Thinking about your request</Shimmer>
            <Shimmer as="span" duration={3} className="text-sm">
              Searching the codebase
            </Shimmer>
          </div>
        </GalleryItem>
        <GalleryItem label="FileChip (plain / clickable)">
          <div className="flex flex-col gap-2">
            <FileChip name="activity-tasks.tsx" />
            <FileChip
              name="trace.tsx"
              path="packages/ui/src/ai-elements/trace.tsx"
              onOpenFile={noop}
            />
          </div>
        </GalleryItem>
      </GalleryGroup>

      <GalleryGroup title="CodeBlock / Artifact">
        <GalleryItem label="CodeBlock + CodeBlockCopyButton" className="w-96">
          <CodeBlock code={SAMPLE_CODE} language="ts">
            <pre className="overflow-x-auto p-3 text-xs">
              <code>{SAMPLE_CODE}</code>
            </pre>
            <CodeBlockCopyButton />
          </CodeBlock>
        </GalleryItem>
        <GalleryItem label="CodeBlock (default children)" className="w-96">
          <CodeBlock code={SAMPLE_CODE} language="ts" />
        </GalleryItem>
        <GalleryItem label="Artifact (all parts)" className="w-[28rem]">
          <Artifact>
            <ArtifactHeader>
              <div>
                <ArtifactTitle>Dashboard component</ArtifactTitle>
                <ArtifactDescription>Updated 2 minutes ago</ArtifactDescription>
              </div>
              <ArtifactActions>
                <ArtifactAction icon={IconCopy} label="Copy" />
                <ArtifactAction icon={IconDownload} tooltip="Download" />
                <ArtifactAction label="Share">
                  <IconShare className="size-4" />
                </ArtifactAction>
                <ArtifactClose />
              </ArtifactActions>
            </ArtifactHeader>
            <ArtifactContent>
              <p className="text-sm">
                Artifact content renders here: a preview, a document or code.
              </p>
            </ArtifactContent>
          </Artifact>
        </GalleryItem>
      </GalleryGroup>

      <GalleryGroup title="Attachments">
        <GalleryItem label='Attachments variant="grid"'>
          <AttachmentsSample variant="grid" />
        </GalleryItem>
        <GalleryItem label='Attachments variant="inline"'>
          <AttachmentsSample variant="inline" />
        </GalleryItem>
        <GalleryItem label='Attachments variant="list"' className="w-96">
          <AttachmentsSample variant="list" />
        </GalleryItem>
        <GalleryItem label="AttachmentEmpty">
          <AttachmentEmpty />
        </GalleryItem>
      </GalleryGroup>
    </>
  );
}
