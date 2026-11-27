import { useState } from "react";
import type { Id } from "@eva/backend";
import { findAIModelOption, getReasoningLevelLabel } from "@eva/backend";
import { moveQueuedId, QUEUE_PANEL_LABEL } from "@eva/shared";
import { UserInitials } from "@eva/shared/user-initials";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ProviderIcon,
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
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  formatModelDisplayLabel,
  tokenTransition,
  useDragSensors,
  skipConfirmTitle,
  useRequestConfirm,
} from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import {
  IconArrowUp,
  IconPencil,
  IconSteeringWheel,
  IconTrash,
} from "@tabler/icons-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface QueuedMessageItem<TId extends string> {
  id: TId;
  content: string;
  model?: string;
  reasoningLevel?: string;
  userId?: Id<"users">;
  steering?: boolean;
}

interface QueuedMessagesPanelProps<TId extends string> {
  items: QueuedMessageItem<TId>[];
  label?: string;
  renderContent?: (content: string) => React.ReactNode;
  onEdit?: (id: TId, content: string) => Promise<void>;
  onDelete?: (id: TId) => Promise<void>;
  onReorder?: (orderedIds: TId[]) => Promise<void>;
  onSteer?: (id: TId) => Promise<void>;
}

function queueModelTooltip(
  model: string,
  reasoningLevel: string | undefined,
): string {
  const option = findAIModelOption(model);
  const modelLabel = formatModelDisplayLabel(option.provider, option.label);
  if (!reasoningLevel) return modelLabel;
  return `${modelLabel} · ${getReasoningLevelLabel(reasoningLevel)}`;
}

function QueueRowHandle({
  item,
  draggable,
  attributes,
  listeners,
}: {
  item: QueuedMessageItem<string>;
  draggable: boolean;
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
}) {
  const dragProps = draggable ? { ...attributes, ...listeners } : {};
  const buttonClass = draggable
    ? "inline-flex size-4 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm border-0 bg-transparent p-0"
    : "inline-flex size-4 shrink-0 items-center justify-center border-0 bg-transparent p-0";

  if (!item.model) {
    return (
      <button
        type="button"
        aria-label={draggable ? "Drag to reorder queued message" : undefined}
        className={buttonClass}
        disabled={!draggable}
        {...dragProps}
      >
        <QueueItemIndicator className="mt-0" />
      </button>
    );
  }

  const option = findAIModelOption(item.model);
  const tooltip = queueModelTooltip(item.model, item.reasoningLevel);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={draggable ? `Drag to reorder · ${tooltip}` : tooltip}
          className={`${buttonClass} text-muted-foreground/70`}
          {...dragProps}
        >
          <ProviderIcon provider={option.provider} size={14} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function SortableQueuedItem<TId extends string>({
  item,
  index,
  draggable,
  renderContent,
  onEditClick,
  onDeleteClick,
  onMoveToFront,
  onSteerClick,
}: {
  item: QueuedMessageItem<TId>;
  index: number;
  draggable: boolean;
  renderContent?: (content: string) => React.ReactNode;
  onEditClick?: (item: QueuedMessageItem<TId>) => void;
  onDeleteClick?: (item: QueuedMessageItem<TId>) => void;
  onMoveToFront?: (item: QueuedMessageItem<TId>) => void;
  onSteerClick?: (item: QueuedMessageItem<TId>) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !draggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <QueueItem
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-50" : undefined}
    >
      <div className="flex items-center gap-2.5">
        {item.userId ? (
          <span className="flex size-4 shrink-0 items-center justify-center">
            <UserInitials userId={item.userId} hideLastSeen />
          </span>
        ) : null}
        <QueueRowHandle
          item={item}
          draggable={draggable}
          attributes={attributes}
          listeners={listeners}
        />
        <QueueItemContent className="text-xs leading-4">
          {renderContent ? renderContent(item.content) : item.content}
        </QueueItemContent>
        {item.steering ? (
          <span className="shrink-0 text-xs leading-4 text-muted-foreground">
            Steering…
          </span>
        ) : (
          <QueueItemActions className="items-center max-sm:[&>button]:size-10">
            {onSteerClick ? (
              <QueueItemAction
                aria-label="Steer with queued message"
                title="Send now and redirect the running agent"
                className="gap-1 px-1.5 text-xs max-sm:w-auto"
                onClick={() => onSteerClick(item)}
              >
                <IconSteeringWheel size={14} />
                Steer
              </QueueItemAction>
            ) : null}
            {onEditClick ? (
              <QueueItemAction
                aria-label="Edit queued message"
                onClick={() => onEditClick(item)}
              >
                <IconPencil size={14} />
              </QueueItemAction>
            ) : null}
            {onMoveToFront && index > 0 ? (
              <QueueItemAction
                aria-label="Move queued message to front"
                onClick={() => onMoveToFront(item)}
              >
                <IconArrowUp size={14} />
              </QueueItemAction>
            ) : null}
            {onDeleteClick ? (
              <QueueItemAction
                aria-label="Delete queued message"
                title={skipConfirmTitle("Delete queued message")}
                onClick={() => onDeleteClick(item)}
              >
                <IconTrash size={14} />
              </QueueItemAction>
            ) : null}
          </QueueItemActions>
        )}
      </div>
    </QueueItem>
  );
}

/**
 * Pending-message queue flush above the composer on sandbox chat pages
 * (sessions, quick tasks, projects). Fills the dock column in ComposerStash
 * (which insets it) with square bottom corners so it blends into the input
 * card — same idea as underCardLeading.
 */
export function QueuedMessagesPanel<TId extends string>({
  items,
  label = QUEUE_PANEL_LABEL,
  renderContent,
  onEdit,
  onDelete,
  onReorder,
  onSteer,
}: QueuedMessagesPanelProps<TId>) {
  const [editingItem, setEditingItem] = useState<QueuedMessageItem<TId> | null>(
    null,
  );
  const [deletingItem, setDeletingItem] =
    useState<QueuedMessageItem<TId> | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [draftForId, setDraftForId] = useState<TId | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { request: requestConfirm } = useRequestConfirm();

  const deleteQueued = async (item: QueuedMessageItem<TId>) => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(item.id);
      setDeletingItem(null);
    } catch (error) {
      setIsDeleting(false);
      throw error;
    }
    setIsDeleting(false);
  };

  const editingId = editingItem?.id ?? null;
  if (editingId !== draftForId) {
    setDraftForId(editingId);
    setDraftContent(editingItem?.content ?? "");
  }

  const sensors = useDragSensors({ sortable: true });

  const draggable = Boolean(onReorder) && items.length > 1;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!onReorder || !over || active.id === over.id) return;
    const moved = items.find((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (!moved || newIndex === -1) return;
    void onReorder(
      moveQueuedId(
        items.map((item) => item.id),
        moved.id,
        newIndex,
      ),
    );
  };

  const handleMoveToFront = (item: QueuedMessageItem<TId>) => {
    if (!onReorder) return;
    void onReorder(
      moveQueuedId(
        items.map((entry) => entry.id),
        item.id,
        0,
      ),
    );
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {items.length > 0 ? (
          <m.div
            key="queued-messages"
            className="w-full"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={tokenTransition.base}
          >
            <Queue className="w-full rounded-b-none rounded-t-surface bg-muted/50 shadow-none">
              <QueueSection defaultOpen>
                <QueueSectionTrigger>
                  <QueueSectionLabel count={items.length} label={label} />
                </QueueSectionTrigger>
                <QueueSectionContent>
                  <QueueList>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={items.map((item) => item.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {items.map((item, index) => (
                          <SortableQueuedItem
                            key={item.id}
                            item={item}
                            index={index}
                            draggable={draggable}
                            renderContent={renderContent}
                            onEditClick={onEdit ? setEditingItem : undefined}
                            onDeleteClick={
                              onDelete
                                ? (item) =>
                                    requestConfirm(
                                      () => setDeletingItem(item),
                                      () => {
                                        void deleteQueued(item);
                                      },
                                    )
                                : undefined
                            }
                            onMoveToFront={
                              onReorder ? handleMoveToFront : undefined
                            }
                            onSteerClick={
                              onSteer
                                ? (item) => {
                                    void onSteer(item.id);
                                  }
                                : undefined
                            }
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  </QueueList>
                </QueueSectionContent>
              </QueueSection>
            </Queue>
          </m.div>
        ) : null}
      </AnimatePresence>

      <Dialog
        open={editingItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingItem(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit queued message</DialogTitle>
          </DialogHeader>
          <Textarea
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            rows={12}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                isSaving || !draftContent.trim() || !editingItem || !onEdit
              }
              onClick={async () => {
                if (!editingItem || !onEdit) {
                  return;
                }
                setIsSaving(true);
                try {
                  await onEdit(editingItem.id, draftContent);
                  setEditingItem(null);
                } catch (error) {
                  setIsSaving(false);
                  throw error;
                }
                setIsSaving(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deletingItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingItem(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete queued message</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove this queued prompt before it runs?
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingItem(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting || !deletingItem || !onDelete}
              onClick={() => {
                if (!deletingItem) return;
                void deleteQueued(deletingItem);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
