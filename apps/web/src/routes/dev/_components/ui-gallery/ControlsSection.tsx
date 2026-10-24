import {
  Badge,
  Button,
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  Checkbox,
  ClearInput,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
  Label,
  SearchInput,
  Slider,
  Switch,
  Textarea,
} from "@vvedantb/ui";
import {
  IconArrowUp,
  IconChevronDown,
  IconMail,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { GalleryGroup, GalleryItem } from "./GalleryItem";
import { DisclosureGroups } from "./ControlsDisclosures";

const BUTTON_VARIANTS = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
] as const;

const BUTTON_SIZES = ["xs", "sm", "default", "lg"] as const;
const ICON_SIZES = ["icon-xs", "icon-sm", "icon"] as const;

const BADGE_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "success",
  "warning",
] as const;

const noop = () => {};

export function ControlsSection() {
  return (
    <>
      <ButtonMatrix />
      <GalleryGroup title="Badge">
        {BADGE_VARIANTS.map((variant) => (
          <GalleryItem key={variant} label={variant}>
            <Badge variant={variant}>{variant}</Badge>
          </GalleryItem>
        ))}
      </GalleryGroup>
      <FormGroup />
      <GroupedInputs />
      <DisclosureGroups />
    </>
  );
}

function ButtonMatrix() {
  return (
    <GalleryGroup title="Button (variant x size)" className="flex-col gap-3">
      {BUTTON_VARIANTS.map((variant) => (
        <GalleryItem key={variant} label={variant}>
          <div className="flex flex-wrap items-center gap-3">
            {BUTTON_SIZES.map((size) => (
              <Button key={size} variant={variant} size={size}>
                {size}
              </Button>
            ))}
            {ICON_SIZES.map((size) => (
              <Button
                key={size}
                variant={variant}
                size={size}
                aria-label={`Add ${size}`}
              >
                <IconPlus />
              </Button>
            ))}
            <Button variant={variant}>
              <IconMail />
              Leading icon
            </Button>
            <Button variant={variant}>
              Trailing icon
              <IconChevronDown />
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
          </div>
        </GalleryItem>
      ))}
    </GalleryGroup>
  );
}

function FormGroup() {
  return (
    <GalleryGroup title="Input / Textarea / Checkbox / Switch / Slider">
      <GalleryItem
        label="Input placeholder / value / disabled / invalid"
        className="w-72"
      >
        <div className="flex flex-col gap-2">
          <Input placeholder="you@example.com" />
          <Input defaultValue="vedant@eva.dev" />
          <Input defaultValue="Disabled" disabled />
          <Input defaultValue="Invalid" aria-invalid="true" />
        </div>
      </GalleryItem>
      <GalleryItem label="Textarea placeholder / value" className="w-72">
        <div className="flex flex-col gap-2">
          <Textarea placeholder="Write a message" />
          <Textarea defaultValue={"Line one\nLine two"} />
        </div>
      </GalleryItem>
      <GalleryItem label="Checkbox off / on / indeterminate / disabled">
        <div className="flex items-center gap-4">
          <Checkbox aria-label="Off" />
          <Checkbox aria-label="On" defaultChecked />
          <Checkbox aria-label="Mixed" checked="indeterminate" />
          <Checkbox aria-label="Disabled" disabled />
          <Checkbox aria-label="Disabled on" disabled defaultChecked />
          <div className="flex items-center gap-2">
            <Checkbox id="g-terms" defaultChecked />
            <Label htmlFor="g-terms">Accept terms</Label>
          </div>
        </div>
      </GalleryItem>
      <GalleryItem label="Switch off / on / disabled">
        <div className="flex items-center gap-4">
          <Switch aria-label="Off" />
          <Switch aria-label="On" defaultChecked />
          <Switch aria-label="Disabled" disabled />
          <Switch aria-label="Disabled on" disabled defaultChecked />
        </div>
      </GalleryItem>
      <GalleryItem label="Slider 40 / range / disabled" className="w-60">
        <div className="flex flex-col gap-5 py-2">
          <Slider defaultValue={[40]} max={100} step={1} />
          <Slider defaultValue={[20, 70]} max={100} step={1} />
          <Slider defaultValue={[60]} max={100} disabled />
        </div>
      </GalleryItem>
    </GalleryGroup>
  );
}

function GroupedInputs() {
  return (
    <GalleryGroup title="ButtonGroup / InputGroup / SearchInput / ClearInput">
      <GalleryItem label="ButtonGroup horizontal + text + separator">
        <ButtonGroup>
          <ButtonGroupText>Branch</ButtonGroupText>
          <Button variant="outline">main</Button>
          <ButtonGroupSeparator />
          <Button variant="outline" size="icon" aria-label="More">
            <IconChevronDown />
          </Button>
        </ButtonGroup>
      </GalleryItem>
      <GalleryItem label="ButtonGroup vertical">
        <ButtonGroup orientation="vertical">
          <Button variant="outline">Top</Button>
          <Button variant="outline">Middle</Button>
          <Button variant="outline">Bottom</Button>
        </ButtonGroup>
      </GalleryItem>
      <GalleryItem label="InputGroup addons start / end" className="w-80">
        <div className="flex flex-col gap-2">
          <InputGroup>
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search files" />
            <InputGroupAddon align="inline-end">
              <InputGroupText>12 results</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <InputGroup>
            <InputGroupInput defaultValue="https://eva.dev" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Delete">
                <IconTrash />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>
      </GalleryItem>
      <GalleryItem label="InputGroup textarea + block-end" className="w-80">
        <InputGroup>
          <InputGroupTextarea placeholder="Ask anything" />
          <InputGroupAddon align="block-end">
            <InputGroupButton size="sm" variant="outline">
              <IconPlus />
              Add
            </InputGroupButton>
            <InputGroupButton
              size="icon-sm"
              variant="default"
              className="ml-auto"
              aria-label="Send"
            >
              <IconArrowUp />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </GalleryItem>
      <GalleryItem label="SearchInput empty / filled" className="w-72">
        <div className="flex flex-col gap-2">
          <SearchInput value="" onChange={noop} onClear={noop} />
          <SearchInput value="button" onChange={noop} onClear={noop} />
        </div>
      </GalleryItem>
      <GalleryItem label="ClearInput empty / filled" className="w-72">
        <div className="flex flex-col gap-2">
          <ClearInput value="" onChange={noop} placeholder="Filter" />
          <ClearInput value="feature/ui" onChange={noop} placeholder="Filter" />
        </div>
      </GalleryItem>
    </GalleryGroup>
  );
}
