# BoardUI component catalog

Every installable BoardUI item, generated from the live registry (version 2026.9.4). Names are exact. Free items install with `npx boardui@latest add <name>`; Pro items need a one-time BoardUI Pro license (https://www.boardui.com/pricing) activated once with `npx boardui@latest login <key>`.

One usage example is inlined per item. For the full snippet set (variants, sizes, states) ask the BoardUI MCP server's get_usage_examples tool, or fetch the item JSON at https://www.boardui.com/r/<name>.json (free items).

## Free components

### Theme tokens

Color primitives, semantic tokens (text/background/border/foreground/chart), radii, shadows, and button gradient utilities.

- Docs: https://www.boardui.com/components/color
- Install: `npx boardui@latest add theme`
- Registry JSON: https://www.boardui.com/r/theme.json

### Typography tokens

The full Figma type scale as composite text-{family}-{weight} Tailwind utilities.

- Docs: https://www.boardui.com/components/typography
- Install: `npx boardui@latest add typography`
- Registry JSON: https://www.boardui.com/r/typography.json

### Chevron icons

Custom chevron glyphs (select caret, sortable table headers) matching the Figma strokes.

- Docs: https://www.boardui.com/components/dropdown
- Install: `npx boardui@latest add chevrons`
- Registry JSON: https://www.boardui.com/r/chevrons.json

### Button

Primary, secondary, ghost, and danger buttons in three sizes with icon support.

- Docs: https://www.boardui.com/components/button
- Install: `npx boardui@latest add button`
- Registry JSON: https://www.boardui.com/r/button.json

Usage:

```tsx
import { RiArrowRightLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";

export function Example() {
  return (
    <div className="flex items-center gap-3">
      <Button>Get started</Button>
      <Button variant="secondary" trailingIcon={RiArrowRightLine}>
        Continue
      </Button>
      <Button variant="ghost">Mark as done</Button>
      <Button variant="danger">Delete</Button>
    </div>
  );
}
```

### Icon Button

Square icon-only button in two sizes.

- Docs: https://www.boardui.com/components/icon-button
- Install: `npx boardui@latest add icon-button`
- Registry JSON: https://www.boardui.com/r/icon-button.json

Usage:

```tsx
import { RiEditLine, RiNotificationLine } from "@remixicon/react";
import { IconButton } from "@/components/base/buttons/icon-button";

export function Example() {
  return (
    <div className="flex items-center gap-3">
      <IconButton icon={RiNotificationLine} aria-label="Notifications" />
      <IconButton icon={RiEditLine} aria-label="Edit" />
    </div>
  );
}
```

### Link Button

Inline text action styled like a link — primary/secondary variants, three sizes, icon support, renders <a> or <button>.

- Docs: https://www.boardui.com/components/link-button
- Install: `npx boardui@latest add link-button`
- Registry JSON: https://www.boardui.com/r/link-button.json

Usage:

```tsx
import { RiArrowRightLine } from "@remixicon/react";
import { LinkButton } from "@/components/base/buttons/link-button";

export function Example() {
  return (
    <>
      <LinkButton href="/pricing" trailingIcon={RiArrowRightLine}>
        Learn more
      </LinkButton>
      <LinkButton variant="secondary" onClick={() => {}}>
        Dismiss
      </LinkButton>
    </>
  );
}
```

### Button Group

Row of secondary-style buttons fused into one bordered control with hairline dividers and selectable items.

- Docs: https://www.boardui.com/components/button-group
- Install: `npx boardui@latest add button-group`
- Registry JSON: https://www.boardui.com/r/button-group.json

Usage:

```tsx
import { ButtonGroup, ButtonGroupItem } from "@/components/base/buttons/button-group";

export function Example() {
  return (
    <ButtonGroup aria-label="Time range">
      <ButtonGroupItem>Day</ButtonGroupItem>
      <ButtonGroupItem>Week</ButtonGroupItem>
      <ButtonGroupItem>Month</ButtonGroupItem>
      <ButtonGroupItem>Year</ButtonGroupItem>
    </ButtonGroup>
  );
}
```

### Close Button

Compact dismiss button for banners, modals, and chips.

- Docs: https://www.boardui.com/components/close-button
- Install: `npx boardui@latest add close-button`
- Registry JSON: https://www.boardui.com/r/close-button.json

Usage:

```tsx
import { CloseButton } from "@/components/base/buttons/close-button";

export function Example() {
  return (
    <div className="flex items-center gap-6">
      <CloseButton size="2xs" aria-label="Close" />
      <CloseButton size="xs" aria-label="Close" />
      <CloseButton size="sm" aria-label="Close" />
      <CloseButton size="md" aria-label="Close" />
    </div>
  );
}
```

### Input

Text input with label, hint text, error states, and leading icon support.

- Docs: https://www.boardui.com/components/input
- Install: `npx boardui@latest add input`
- Registry JSON: https://www.boardui.com/r/input.json

Usage:

```tsx
import { Input } from "@/components/base/input/input";
import { RiUserSmileLine, RiQuestionLine } from "@remixicon/react";

export function Example() {
  return (
    <Input
      label="Email"
      isRequired
      tooltip
      placeholder="Enter your email"
      hint="This is a hint about this input."
      leadingIcon={RiUserSmileLine}
      trailingIcon={RiQuestionLine}
    />
  );
}
```

### Checkbox

React Aria checkbox with animated tick and indeterminate state.

- Docs: https://www.boardui.com/components/checkbox
- Install: `npx boardui@latest add checkbox`
- Registry JSON: https://www.boardui.com/r/checkbox.json

Usage:

```tsx
import { Checkbox } from "@/components/base/checkbox/checkbox";

export function Example() {
  return (
    <div className="flex items-center gap-6">
      <Checkbox aria-label="Unchecked" />
      <Checkbox defaultSelected aria-label="Checked" />
      <Checkbox isIndeterminate aria-label="Indeterminate" />
      <Checkbox isDisabled aria-label="Disabled" />
    </div>
  );
}
```

### Checkbox Card

Bordered selectable card driven by a checkbox.

- Docs: https://www.boardui.com/components/checkbox
- Install: `npx boardui@latest add checkbox-card`
- Registry JSON: https://www.boardui.com/r/checkbox-card.json

### Radio

React Aria radio group with the gradient selected dot, two sizes, and the bare RadioDot glyph for menu rows.

- Docs: https://www.boardui.com/components/radio
- Install: `npx boardui@latest add radio`
- Registry JSON: https://www.boardui.com/r/radio.json

Usage:

```tsx
import { Radio, RadioGroup } from "@/components/base/radio/radio";

export function Example() {
  return (
    <RadioGroup aria-label="Billing period" defaultValue="monthly">
      <Radio value="monthly">Monthly billing</Radio>
      <Radio value="yearly">Yearly billing</Radio>
      <Radio value="usage" isDisabled>Usage based</Radio>
    </RadioGroup>
  );
}
```

### Radio Card

Bordered selectable card driven by a radio — the radio flavor of Checkbox Card.

- Docs: https://www.boardui.com/components/radio
- Install: `npx boardui@latest add radio-card`
- Registry JSON: https://www.boardui.com/r/radio-card.json

### Switch

Skeuomorphic toggle switch in two sizes.

- Docs: https://www.boardui.com/components/switch
- Install: `npx boardui@latest add switch`
- Registry JSON: https://www.boardui.com/r/switch.json

Usage:

```tsx
import { Switch } from "@/components/base/switch/switch";

export function Example() {
  return (
    <div className="flex items-center gap-6">
      <Switch defaultSelected>Enable notifications</Switch>
      <Switch shape="rectangle" size="sm" aria-label="Compact" />
    </div>
  );
}
```

### Switch Card

Bordered settings row driven by a switch.

- Docs: https://www.boardui.com/components/switch
- Install: `npx boardui@latest add switch-card`
- Registry JSON: https://www.boardui.com/r/switch-card.json

### Theme Toggle

Manual light/dark control with a click-origin reveal, local persistence, and no system-theme dependency.

- Docs: https://www.boardui.com/components/theme-toggle
- Install: `npx boardui@latest add theme-toggle`
- Registry JSON: https://www.boardui.com/r/theme-toggle.json

Usage:

```tsx
import { ThemeToggle } from "@/components/application/theme/theme-toggle";

export function SidebarFooter() {
  return <ThemeToggle />;
}
```

### Select

React Aria select with styled trigger, non-modal popover, and free-form item content.

- Docs: https://www.boardui.com/components/select
- Install: `npx boardui@latest add select`
- Registry JSON: https://www.boardui.com/r/select.json

Usage:

```tsx
import { Select, SelectItem } from "@/components/base/select/select";

export function Example() {
  return (
    <Select aria-label="Filter by price" defaultSelectedKey="all">
      <SelectItem id="all" textValue="All prices">All prices</SelectItem>
      <SelectItem id="low" textValue="Under $100">Under $100</SelectItem>
      <SelectItem id="high" textValue="Over $100">Over $100</SelectItem>
    </Select>
  );
}
```

### Slider

Single-value and min/max range sliders with exact-value bubbles and keyboard controls.

- Docs: https://www.boardui.com/components/slider
- Install: `npx boardui@latest add slider`
- Registry JSON: https://www.boardui.com/r/slider.json

Usage:

```tsx
import { RangeSlider, Slider } from "@/components/base/slider/slider";

export function Example() {
  return (
    <div className="flex max-w-md flex-col gap-10">
      <Slider label="Volume" defaultValue={42} />
      <RangeSlider
        label="Monthly budget"
        defaultValue={[25, 75]}
        formatValue={(value) => `$${value}`}
      />
    </div>
  );
}
```

### Social Button

Sign-in buttons for 24 providers, with brand logos, three colour treatments and an icon-only form.

- Docs: https://www.boardui.com/components/social-button
- Install: `npx boardui@latest add social-button`
- Registry JSON: https://www.boardui.com/r/social-button.json

Usage:

```tsx
import { SocialButton } from "@/components/base/social-button/social-button";

export function Example() {
  return (
    <div className="flex flex-col gap-3">
      <SocialButton brand="google" />
      <SocialButton brand="github" appearance="black" />
      <SocialButton brand="slack" appearance="white" />
    </div>
  );
}
```

### Dropdown

Composable popover menu (trigger, panel, groups, rows, dividers) built on React Aria — the recipe behind the sidebar team/account menus.

- Docs: https://www.boardui.com/components/dropdown
- Install: `npx boardui@latest add dropdown`
- Registry JSON: https://www.boardui.com/r/dropdown.json

Usage:

```tsx
import { useState } from "react";
import { RiAddLine, RiAttachment2, RiFocus3Line, RiListCheck3 } from "@remixicon/react";
import {
  Dropdown,
  DropdownGroup,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from "@/components/base/dropdown/dropdown";
import { cx } from "@/utils/cx";

const ROWS = [
  { icon: RiAttachment2, label: "Files and folders" },
  { icon: RiFocus3Line, label: "Goal", description: "Set a goal for faster results" },
  { icon: RiListCheck3, label: "Plan mode", description: "Manage complex tasks" },
];

export function Example() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dropdown isOpen={isOpen} onOpenChange={setIsOpen}>
      <DropdownTrigger
        aria-label="Add to chat"
        className="flex size-9 items-center justify-center rounded-full bg-background-secondary-default p-2 transition-colors hover:bg-background-secondary-hover"
      >
        <RiAddLine
          className={cx(
            "size-5 text-foreground-icon-secondary transition-transform duration-200",
            isOpen && "rotate-45",
          )}
          aria-hidden
        />
      </DropdownTrigger>

      <DropdownPopover aria-label="Add to chat" className="w-[361px] p-2" dialogClassName="gap-2">
        <DropdownGroup label="Add">
          {ROWS.map(({ icon: Icon, label, description }) => (
            <DropdownItem key={label} onSelect={() => setIsOpen(false)} className="px-2 py-1.5">
              <Icon className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
              <span className="truncate text-body-medium whitespace-nowrap">
                <span className="text-text-primary">{label}</span>
                {description && <span className="ml-1.5 text-text-secondary">{description}</span>}
              </span>
            </DropdownItem>
          ))}
        </DropdownGroup>
      </DropdownPopover>
    </Dropdown>
  );
}
```

### Divider

Horizontal content divider with single-line, double-line, filled, and aligned variants.

- Docs: https://www.boardui.com/components/divider
- Install: `npx boardui@latest add divider`
- Registry JSON: https://www.boardui.com/r/divider.json

Usage:

```tsx
import { Divider } from "@/components/base/divider/divider";

export function Example() {
  return (
    <div className="flex w-full flex-col gap-8">
      <Divider>Notifications</Divider>
      <Divider variant="double">Today</Divider>
      <Divider variant="fill">Latest activity</Divider>
    </div>
  );
}
```

### File Upload

Drag-and-drop file upload with validation, animated progress, and a completion callback.

- Docs: https://www.boardui.com/components/file-upload
- Install: `npx boardui@latest add file-upload`
- Registry JSON: https://www.boardui.com/r/file-upload.json

Usage:

```tsx
import { FileUpload } from "@/components/base/file-upload/file-upload";

export function Example() {
  return (
    <FileUpload
      onUploadComplete={(file) => {
        console.log("Ready to persist:", file);
      }}
    />
  );
}
```

### Tabs

Underline and pill tab variants built on React Aria.

- Docs: https://www.boardui.com/components/tabs
- Install: `npx boardui@latest add tabs`
- Registry JSON: https://www.boardui.com/r/tabs.json

Usage:

```tsx
import { RiImage2Line, RiArticleLine } from "@remixicon/react";
import { Tab, TabList, TabPanel, Tabs } from "@/components/base/tabs/tabs";

export function Example() {
  return (
    <Tabs defaultSelectedKey="banners">
      <TabList aria-label="Content types">
        <Tab id="banners" icon={RiImage2Line} count={152}>
          Banners
        </Tab>
        <Tab id="posts" icon={RiArticleLine} count={32}>
          Posts
        </Tab>
        <Tab id="settings">Settings</Tab>
      </TabList>

      <TabPanel id="banners" />
      <TabPanel id="posts" />
      <TabPanel id="settings" />
    </Tabs>
  );
}
```

### Table

Static table primitives matching the dashboard tables.

- Docs: https://www.boardui.com/components/table
- Install: `npx boardui@latest add table`
- Registry JSON: https://www.boardui.com/r/table.json

Usage:

```tsx
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/base/table/table";

export function Example() {
  return (
    <Table aria-label="Users">
      <TableHeader>
        <TableColumn id="name" isRowHeader>Name</TableColumn>
        <TableColumn id="role">Role</TableColumn>
        <TableColumn id="status">Status</TableColumn>
      </TableHeader>
      <TableBody>
        <TableRow id="1">
          <TableCell id="name">Olivia Rhye</TableCell>
          <TableCell id="role">Product Designer</TableCell>
          <TableCell id="status">Active</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
```

### Tooltip

Light-surface tooltip built on React Aria.

- Docs: https://www.boardui.com/components/tooltip
- Install: `npx boardui@latest add tooltip`
- Registry JSON: https://www.boardui.com/r/tooltip.json

Usage:

```tsx
import { Focusable } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";

export function Example() {
  return (
    <TooltipTrigger delay={0}>
      {/* Focusable adapts our plain-<button> Button into a valid trigger */}
      <Focusable>
        <Button variant="secondary">Hover me</Button>
      </Focusable>
      <Tooltip>12 contributions on April 26</Tooltip>
    </TooltipTrigger>
  );
}
```

### Badge

Counter pills and the Kbd shortcut hint.

- Docs: https://www.boardui.com/components/badge
- Install: `npx boardui@latest add badge`
- Registry JSON: https://www.boardui.com/r/badge.json

Usage:

```tsx
import { Badge } from "@/components/base/badges/badge";

export function Example() {
  return (
    <div className="flex items-center gap-4">
      <Badge color="neutral">91</Badge>
      <Badge color="primary">152</Badge>
    </div>
  );
}
```

### Chip

Status/delta chips in bold and soft variants across the accent palette.

- Docs: https://www.boardui.com/components/chip
- Install: `npx boardui@latest add chip`
- Registry JSON: https://www.boardui.com/r/chip.json

Usage:

```tsx
import { Chip } from "@/components/base/badges/chip";

export function Example() {
  return (
    <div className="flex items-center gap-3">
      <Chip variant="bold" color="lime">+12.5%</Chip>
      <Chip variant="subtle" color="cyan">$3.252</Chip>
      <Chip variant="caption" color="rose">Backend Engineer</Chip>
    </div>
  );
}
```

### Status Dot

Colored status indicator dot used inside selects and tables.

- Docs: https://www.boardui.com/components/chip
- Install: `npx boardui@latest add status-dot`
- Registry JSON: https://www.boardui.com/r/status-dot.json

### Avatar

Image or initials avatar in multiple sizes and tints.

- Docs: https://www.boardui.com/components/avatar
- Install: `npx boardui@latest add avatar`
- Registry JSON: https://www.boardui.com/r/avatar.json

Usage:

```tsx
import { Avatar } from "@/components/base/avatar/avatar";

export function Example() {
  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg" src="/avatars/livia-saris.webp" alt="Livia Saris" />
      <Avatar size="lg" color="blue" initials="B" />
      <Avatar size="lg" color="neutral" initials="M" />
    </div>
  );
}
```

### Breadcrumb

Icon-capable breadcrumb trail.

- Docs: https://www.boardui.com/components/breadcrumb
- Install: `npx boardui@latest add breadcrumb`
- Registry JSON: https://www.boardui.com/r/breadcrumb.json

Usage:

```tsx
import { RiHomeLine } from "@remixicon/react";
import { Breadcrumb, BreadcrumbItem } from "@/components/base/breadcrumb/breadcrumb";

export function Example() {
  return (
    <Breadcrumb aria-label="Pages">
      <BreadcrumbItem href="/dashboard">Dashboard</BreadcrumbItem>
      <BreadcrumbItem href="/projects">Projects</BreadcrumbItem>
      <BreadcrumbItem current icon={RiHomeLine}>
        BoardUI
      </BreadcrumbItem>
    </Breadcrumb>
  );
}
```

### Pagination

Numbered pagination with prev/next and ellipsis collapsing.

- Docs: https://www.boardui.com/components/pagination
- Install: `npx boardui@latest add pagination`
- Registry JSON: https://www.boardui.com/r/pagination.json

Usage:

```tsx
import { useState } from "react";
import { Pagination } from "@/components/base/pagination/pagination";

export function Example() {
  const [page, setPage] = useState(1);

  return (
    <Pagination
      page={page}
      totalPages={10}
      onChange={setPage}
    />
  );
}
```

### Carousel

Gallery carousel built on CSS scroll-snap: swipe, arrows and a position indicator.

- Docs: https://www.boardui.com/components/carousel
- Install: `npx boardui@latest add carousel`
- Registry JSON: https://www.boardui.com/r/carousel.json

Usage:

```tsx
import { Carousel, CarouselItem } from "@/components/base/carousel/carousel";

export function Example() {
  return (
    <Carousel aria-label="Recent work">
      {items.map((item) => (
        <CarouselItem key={item.id}>
          <div className="rounded-2lg border border-border-button-default p-4">
            {item.title}
          </div>
        </CarouselItem>
      ))}
    </Carousel>
  );
}
```

### Input OTP

One-time-code field with a monospace box per digit, paste distribution and autofill support.

- Docs: https://www.boardui.com/components/input-otp
- Install: `npx boardui@latest add input-otp`
- Registry JSON: https://www.boardui.com/r/input-otp.json

Usage:

```tsx
import { InputOtp } from "@/components/base/input-otp/input-otp";

export function Example() {
  return (
    <InputOtp
      aria-label="Verification code"
      onComplete={(code) => verify(code)}
    />
  );
}
```

### Segmented Control

Pill-style segmented control (Weekly / Monthly / Yearly switchers).

- Docs: https://www.boardui.com/components/segmented-control
- Install: `npx boardui@latest add segmented-control`
- Registry JSON: https://www.boardui.com/r/segmented-control.json

Usage:

```tsx
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/base/segmented-control/segmented-control";

export function Example() {
  return (
    <SegmentedControl defaultSelectedKeys={["weekly"]} aria-label="Period">
      <SegmentedControlItem id="weekly">Weekly</SegmentedControlItem>
      <SegmentedControlItem id="monthly">Monthly</SegmentedControlItem>
      <SegmentedControlItem id="yearly">Yearly</SegmentedControlItem>
    </SegmentedControl>
  );
}
```

### Announcement

Dismissible announcement card used in the sidebar footer.

- Docs: https://www.boardui.com/components/announcement
- Install: `npx boardui@latest add announcement`
- Registry JSON: https://www.boardui.com/r/announcement.json

Usage:

```tsx
import { Announcement } from "@/components/base/announcement/announcement";

export function Example() {
  return (
    <Announcement
      title="Setting up your account"
      description="Take the tour and learn how to use our product."
      actionLabel="Take the tour"
      dismissible
      onAction={() => startTour()}
    />
  );
}
```

### Notification

Dismissible notification with status icons, avatars, action buttons, and timed countdown.

- Docs: https://www.boardui.com/components/notification
- Install: `npx boardui@latest add notification`
- Registry JSON: https://www.boardui.com/r/notification.json

Usage:

```tsx
import { Notification } from "@/components/base/notification/notification";

export function Example() {
  return (
    <Notification
      avatar={{
        src: "/avatars/katherine-moss.webp",
        alt: "Katherine Moss",
        presence: "online",
      }}
      title="Katherine Moss"
      timestamp="2 mins ago"
      description="I've finished adding my notes. Happy for us to review whenever you're ready!"
      actions={[
        { label: "Dismiss", variant: "secondary" },
        { label: "View changelog", variant: "primary" },
      ]}
    />
  );
}
```

### Kbd

Keyboard shortcut hint pill.

- Docs: https://www.boardui.com/components/badge
- Install: `npx boardui@latest add kbd`
- Registry JSON: https://www.boardui.com/r/kbd.json

### Date Picker

Single-date picker with month navigation, built on React Aria.

- Docs: https://www.boardui.com/components/date-picker
- Install: `npx boardui@latest add date-picker`
- Registry JSON: https://www.boardui.com/r/date-picker.json

Usage:

```tsx
import { DatePicker } from "@/components/base/date-picker/date-picker";

export function Example() {
  return <DatePicker aria-label="Meeting date" />;
}
```

### Date Range Picker

Two-month range picker sharing the date-picker chrome.

- Docs: https://www.boardui.com/components/date-picker
- Install: `npx boardui@latest add date-range-picker`
- Registry JSON: https://www.boardui.com/r/date-range-picker.json

Usage:

```tsx
import { DateRangePicker } from "@/components/base/date-picker/date-range-picker";

export function Example() {
  return <DateRangePicker aria-label="Trip dates" />;
}
```

### Meeting Scheduler

Date + time-slot scheduler popover.

- Docs: https://www.boardui.com/components/date-picker
- Install: `npx boardui@latest add meeting-scheduler`
- Registry JSON: https://www.boardui.com/r/meeting-scheduler.json

### Agent runtime

Streaming chat endpoint for agent templates: one AI_API_KEY from OpenAI, Anthropic, Google, OpenRouter, Groq, xAI or Vercel AI Gateway (or any OpenAI-compatible server by URL), a config probe for unconfigured deploys, and the message contract the BoardUI chat UI installs against.

- Docs: https://www.boardui.com/components/chat-starter
- Install: `npx boardui@latest add agent-runtime`
- Registry JSON: https://www.boardui.com/r/agent-runtime.json

### Agent Chat

A working chat app: app sidebar, streaming replies, thinking indicator, a composer pill with stop control, a chat-history rail with local thread switching, and a setup notice when no provider key is set.

- Docs: https://www.boardui.com/components/chat-starter
- Install: `npx boardui@latest add agent-chat`
- Registry JSON: https://www.boardui.com/r/agent-chat.json

### Agent Thinking

Agent thinking indicator for chat composers — dot wave, dot spin, stars, and infinity variants with a shimmering label and elapsed timer.

- Docs: https://www.boardui.com/components/agent-thinking
- Install: `npx boardui@latest add agent-thinking`
- Registry JSON: https://www.boardui.com/r/agent-thinking.json

Usage:

```tsx
"use client";

import { AgentThinking } from "@/components/application/agent-thinking/agent-thinking";

export function Example() {
  return <AgentThinking variant="wave" label="Thinking" />;
}
```

### Composer Loader

Loading state that wraps a chat composer — an iridescent light band orbiting the rim with a soft inward bloom, fading in while the agent works.

- Docs: https://www.boardui.com/components/composer-loader
- Install: `npx boardui@latest add composer-loader`
- Registry JSON: https://www.boardui.com/r/composer-loader.json

Usage:

```tsx
"use client";

import { ComposerLoader } from "@/components/application/composer-loader/composer-loader";

export function Example() {
  return (
    <ComposerLoader active>
      {/* The wrapped composer must not paint its own surface — the light
          layers between the pill background and the content. */}
      <Composer className="bg-transparent shadow-none" />
    </ComposerLoader>
  );
}
```

### Sidebar

The floating dashboard sidebar with team menu, nav, announcement, and user menu.

- Docs: https://www.boardui.com/components/sidebar
- Install: `npx boardui@latest add sidebar`
- Registry JSON: https://www.boardui.com/r/sidebar.json

Usage:

```tsx
import { DashboardSidebar } from "@/components/application/dashboard/dashboard-sidebar";

export function Example() {
  return (
    <div className="flex min-h-screen bg-background-full">
      <DashboardSidebar />
      <main className="flex-1">{/* page content */}</main>
    </div>
  );
}
```

### Settings Modal

Controlled multi-page settings dialog with General, Profile, Tools, and Storage views.

- Docs: https://www.boardui.com/components/settings-modal
- Install: `npx boardui@latest add settings-modal`
- Registry JSON: https://www.boardui.com/r/settings-modal.json

Usage:

```tsx
"use client";

import { useState } from "react";
import { RiSettingsLine } from "@remixicon/react";
import { SettingsModal } from "@/components/application/settings/settings-modal";
import { Button } from "@/components/base/buttons/button";

export function SettingsTrigger() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        leadingIcon={RiSettingsLine}
        onClick={() => setIsOpen(true)}
      >
        Open settings
      </Button>
      <SettingsModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
```

### Auth Card

Sign-in and sign-up cards with social providers stacked with labels or inline as icons, plus email fields and a CTA.

- Docs: https://www.boardui.com/components/auth-card
- Install: `npx boardui@latest add auth-card`
- Registry JSON: https://www.boardui.com/r/auth-card.json

Usage:

```tsx
import { AuthCard } from "@/components/application/auth/auth-card";

export function Example() {
  return (
    <AuthCard
      mode="signin"
      layout="stacked"
      providers={["google", "apple", "github"]}
      onSubmit={(data) => signIn("credentials", Object.fromEntries(data))}
      onProvider={(provider) => signIn(provider)}
    />
  );
}
```

### Notification Center

Tabbed activity inbox with grouped notifications, unread state, avatars, status icons, and inline actions.

- Docs: https://www.boardui.com/components/notification-center
- Install: `npx boardui@latest add notification-center`
- Registry JSON: https://www.boardui.com/r/notification-center.json

Usage:

```tsx
"use client";

import { NotificationCenter } from "@/components/application/notification-center/notification-center";

const notifications = [
  {
    id: "mention-notes",
    category: "mentions",
    group: "Today",
    title: "Livia mentioned you",
    description: "Can you review the new empty state before we ship?",
    timestamp: "2m",
    unread: true,
    avatar: { src: "/avatars/livia-saris.webp", alt: "Livia Saris" },
    actions: [
      { id: "reply", label: "Reply", variant: "primary" },
      { id: "view", label: "View thread", variant: "secondary" },
    ],
  },
  {
    id: "backup-ready",
    category: "system",
    group: "Today",
    title: "Workspace backup is ready",
    description: "The latest backup finished successfully.",
    timestamp: "18m",
    unread: true,
    status: "success",
  },
];

export function Example() {
  return (
    <NotificationCenter
      notifications={notifications}
      onAction={(notificationId, actionId) => {
        console.log(notificationId, actionId);
      }}
    />
  );
}
```

### Data Table

TanStack-powered data table with sorting, selection, and pagination.

- Docs: https://www.boardui.com/components/data-table
- Install: `npx boardui@latest add data-table`
- Registry JSON: https://www.boardui.com/r/data-table.json

Usage:

```tsx
import { DataTableExample } from "@/components/application/data-table/data-table";

export function Example() {
  // Sorting, selection, and pagination state live inside - powered by
  // TanStack Table with our Table, Checkbox, Chip, Select, and Pagination
  // primitives for rendering.
  return <DataTableExample />;
}
```

### Stat Cards

KPI stat card row with delta chips.

- Docs: https://www.boardui.com/components/stat-cards
- Install: `npx boardui@latest add stat-cards`
- Registry JSON: https://www.boardui.com/r/stat-cards.json

Usage:

```tsx
import { StatCards } from "@/components/application/dashboard/stat-cards";

export function Example() {
  // Four KPI cards with gradient icon tiles, info tooltips, and a
  // footer band carrying the comparison caption and delta pill.
  return <StatCards variant="footer" />;
}
```

### Revenue Chart Card

Free chart card: a year of monthly revenue as an area against the year before, with a count-up headline, delta chip and hover readout per month.

- Docs: https://www.boardui.com/components/revenue-chart-card
- Install: `npx boardui@latest add revenue-chart-card`
- Registry JSON: https://www.boardui.com/r/revenue-chart-card.json

Usage:

```tsx
import { RevenueChartCard } from "@/components/application/dashboard/revenue-chart-card";

export function Example() {
  return <RevenueChartCard />;
}
```

### Orders Chart Card

Free chart card: a year of monthly orders as bars, this year beside last year for every month, with a count-up headline, delta chip and hover readout.

- Docs: https://www.boardui.com/components/orders-chart-card
- Install: `npx boardui@latest add orders-chart-card`
- Registry JSON: https://www.boardui.com/r/orders-chart-card.json

Usage:

```tsx
import { OrdersChartCard } from "@/components/application/dashboard/orders-chart-card";

export function Example() {
  return <OrdersChartCard />;
}
```

### Important Alerts Card

Scrollable alert feed with tinted icon circles and date pills.

- Docs: https://www.boardui.com/components/medical-profile
- Install: `npx boardui@latest add important-alerts-card`
- Registry JSON: https://www.boardui.com/r/important-alerts-card.json

### Patient Info Card

Profile card with avatar and label/value detail rows.

- Docs: https://www.boardui.com/components/medical-profile
- Install: `npx boardui@latest add patient-info-card`
- Registry JSON: https://www.boardui.com/r/patient-info-card.json

## Pro components

### Web Search

Streaming research trail: the queries an agent ran and the sources it opened, with real site marks.

- Docs: https://www.boardui.com/components/web-search
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add web-search`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
"use client";

import { RiGlobalLine } from "@remixicon/react";
import { WebSearch } from "@/components/application/web-search/web-search";

const steps = [
  { label: "Ran 3 searches", icon: RiGlobalLine },
  {
    label: "Searched X for",
    query: "react component library pricing",
    brand: "x",
    meta: "7 posts",
  },
  {
    label: "Component library pricing",
    icon: RiGlobalLine,
    meta: "5 results",
    sources: [
      {
        title: "Tailwind UI vs building your own",
        domain: "www.reddit.com",
        brand: "reddit",
        href: "https://www.reddit.com",
      },
    ],
  },
];

export function Example() {
  return <WebSearch steps={steps} />;
}
```

### Task List

Streaming agent task log: tasks reveal step by step with soft height, blur, and a shimmering running title.

- Docs: https://www.boardui.com/components/task-list
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add task-list`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
"use client";

import { RiSearchLine } from "@remixicon/react";
import { TaskList } from "@/components/application/task-list/task-list";

const tasks = [
  {
    title: "Found project files",
    runningTitle: "Searching project files",
    icon: RiSearchLine,
    steps: [
      { label: 'Searching "app/page.tsx, components structure"' },
      { label: "Read", chips: [{ label: "page.tsx" }] },
      { label: "Scanning 52 files" },
      { label: "Reading files", chips: [{ label: "layout.tsx" }] },
    ],
  },
];

export function Example() {
  return <TaskList tasks={tasks} />;
}
```

### Composer

The AI chat composer, whole package: attachment and model menus, voice and send controls, the status bar, and the liquid-glass loading treatment for its controls.

- Docs: https://www.boardui.com/components/composer
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add composer`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
"use client";

import { AiChatComposerPreview } from "@/components/application/ai-chat/ai-chat-composer";

export function Example() {
  return <AiChatComposerPreview />;
}
```

### Agent Progress

Collapsible multi-step AI task progress with animated active, pending, and completed states.

- Docs: https://www.boardui.com/components/agent-progress
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add agent-progress`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
"use client";

import { AgentProgress } from "@/components/application/agent-progress/agent-progress";

const steps = [
  "Read project files",
  "Update light mode tokens",
  "Implement dark mode tokens",
  "Register the theme toggle",
  "Run lint and production build",
];

export function Example() {
  return <AgentProgress steps={steps} />;
}
```

### Agent Limits Card

Context window usage bar with an expandable token breakdown, collapsible groups, and plan usage limits with reset times.

- Docs: https://www.boardui.com/components/agent-limits-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add agent-limits-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { AgentLimitsCard } from "@/components/application/agent-limits/agent-limits-card";

export function Example() {
  // Click "Context window" to expand the breakdown - the card grows with it.
  return <AgentLimitsCard planHref="/settings/plan" />;
}
```

### Calendar

Month-view calendar with event chips, details popover, month switcher, and inbox feed.

- Docs: https://www.boardui.com/components/calendar
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add calendar`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { useMemo, useState } from "react";
import { getLocalTimeZone, startOfMonth } from "@internationalized/date";
import { CalendarHeader } from "@/components/application/calendar/calendar-header";
import { CalendarMonthGrid } from "@/components/application/calendar/calendar-month-grid";

export function Example() {
  const [month, setMonth] = useState(/* CalendarDate */);
  const [highlightedDate, setHighlightedDate] = useState(null);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
        month.toDate(getLocalTimeZone()),
      ),
    [month],
  );

  return (
    <div className="flex w-full flex-col gap-2.5">
      <CalendarHeader
        month={month}
        monthLabel={monthLabel}
        onPrevMonth={() => setMonth((m) => m.subtract({ months: 1 }))}
        onNextMonth={() => setMonth((m) => m.add({ months: 1 }))}
        onSelectDate={(date) => {
          setMonth(startOfMonth(date));
          setHighlightedDate(date);
        }}
      />
      <div className="w-full overflow-hidden rounded-b-3xl bg-background-secondary-default p-0 sm:overflow-visible sm:rounded-3xl sm:p-3">
        <CalendarMonthGrid
          month={month}
          highlightedDate={highlightedDate}
          onHighlightEnd={() => setHighlightedDate(null)}
        />
      </div>
    </div>
  );
}
```

### Earnings Chart Card

Bar chart card with period switcher, count-up headline, and hover outline.

- Docs: https://www.boardui.com/components/earnings-chart-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add earnings-chart-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { EarningsChartCard } from "@/components/application/dashboard/earnings-chart-card";

export function Example() {
  return <EarningsChartCard />;
}
```

### Line Chart Card

Line/area chart card with gradient fill, curved or sharp interpolation, and animated active dot.

- Docs: https://www.boardui.com/components/line-chart-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add line-chart-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { LineChartCard } from "@/components/application/dashboard/line-chart-card";

export function Example() {
  return <LineChartCard />;
}
```

### Contributions Card

GitHub-style contributions heat grid with swappable accent family.

- Docs: https://www.boardui.com/components/contributions-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add contributions-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { ContributionsCard } from "@/components/application/dashboard/contributions-card";

export function Example() {
  // accent: "emerald" | "green" | "teal" | "cyan" | "blue" |
  //         "indigo" | "violet" | "rose" | "amber"
  return <ContributionsCard accent="violet" />;
}
```

### Radar Chart Card

Radar chart card with filled, dotted, lines-only, and centre-score variants, hover-linked headline, and multi-series legend.

- Docs: https://www.boardui.com/components/radar-chart-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add radar-chart-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { RadarChartCard } from "@/components/application/charts/radar-chart-card";

export function Example() {
  // Demo periods in the top-right dropdown; tiles adds a stat tile per axis below.
  return <RadarChartCard tiles />;
}
```

### Radial Chart Card

Radial bar chart card: concentric rings (plain, labelled, or over a grid), single-value gauges, and a stacked half gauge.

- Docs: https://www.boardui.com/components/radial-chart-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add radial-chart-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { RadialChartCard } from "@/components/application/charts/radial-chart-card";

export function Example() {
  // Demo periods in the top-right dropdown; tiles adds the stat tiles below.
  return <RadialChartCard tiles />;
}
```

### Funnel Chart Card

Horizontal flow funnel with curved or sharp tapers, centred conversion pills, mono option, and a value/name footer under every column.

- Docs: https://www.boardui.com/components/funnel-chart-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add funnel-chart-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { FunnelChartCard } from "@/components/application/charts/funnel-chart-card";

export function Example() {
  // No props: three built-in demo periods in the top-right dropdown.
  return <FunnelChartCard />;
}
```

### Sankey Chart Card

Sankey flow card with pill nodes, target-tinted links, source and share labels, and hover isolation.

- Docs: https://www.boardui.com/components/sankey-chart-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add sankey-chart-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { SankeyChartCard } from "@/components/application/charts/sankey-chart-card";

export function Example() {
  // No data props: three built-in demo periods in the top-right dropdown.
  return <SankeyChartCard axisLabels={["Tracked time", "Share of tracked time"]} />;
}
```

### Stage Bars Card

Funnel stages as rounded horizontal pills with name, value, and share per stage, animated widths, and a mono option.

- Docs: https://www.boardui.com/components/stage-bars-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add stage-bars-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { StageBarsCard } from "@/components/application/charts/stage-bars-card";

export function Example() {
  // No props: three built-in demo periods in the top-right dropdown.
  return <StageBarsCard />;
}
```

### Bar List Card

Analytics breakdown list: ranked rows with share bars behind the labels, tabbed lists, metric caption, and a show-more pill.

- Docs: https://www.boardui.com/components/bar-list-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add bar-list-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { BarListCard } from "@/components/application/charts/bar-list-card";

export function Example() {
  // No props: Devices / Browsers / Operating systems / Screen sizes demo tabs.
  return <BarListCard />;
}
```

### Area Chart Card

Multi-series area chart with stacked, overlapping and 100% variants, gradient fills, period dropdown and stat tiles.

- Docs: https://www.boardui.com/components/area-chart-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add area-chart-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { AreaChartCard } from "@/components/application/charts/area-chart-card";

export function Example() {
  // No props: three built-in demo periods in the top-right dropdown.
  return <AreaChartCard tiles />;
}
```

### Combo Chart Card

Bar-plus-line combo chart with independent left and right axes, hover dimming, and a pulsing active dot.

- Docs: https://www.boardui.com/components/combo-chart-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add combo-chart-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { ComboChartCard } from "@/components/application/charts/combo-chart-card";

export function Example() {
  // No props: three built-in demo periods in the top-right dropdown.
  return <ComboChartCard tiles />;
}
```

### Scatter Chart Card

Scatter and bubble chart with grouped series, an optional size measure, hover isolation and stat tiles.

- Docs: https://www.boardui.com/components/scatter-chart-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add scatter-chart-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { ScatterChartCard } from "@/components/application/charts/scatter-chart-card";

export function Example() {
  // No props: three built-in demo periods in the top-right dropdown.
  return <ScatterChartCard axisLabels={["Sessions", "Revenue"]} tiles />;
}
```

### Heatmap Chart Card

Matrix heatmap card (rows × columns) with a theme-following ramp, hover-linked headline, and Less → More legend.

- Docs: https://www.boardui.com/components/heatmap-chart-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add heatmap-chart-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { HeatmapChartCard } from "@/components/application/charts/heatmap-chart-card";

export function Example() {
  // No props: three built-in demo periods in the top-right dropdown.
  return <HeatmapChartCard />;
}
```

### Steps Card

Weekly steps bar chart with week switcher, count-up headline, and hover outline.

- Docs: https://www.boardui.com/components/steps-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add steps-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { StepsCard } from "@/components/application/medical/steps-card";

export function Example() {
  return <StepsCard />;
}
```

### Sleep Score Card

Segmented score ring with hover-focused sub-scores and metric rows.

- Docs: https://www.boardui.com/components/sleep-score-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add sleep-score-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { SleepScoreCard } from "@/components/application/medical/sleep-score-card";

export function Example() {
  return <SleepScoreCard />;
}
```

### Activity Rings Card

Apple Watch-style concentric goal rings with stat tiles.

- Docs: https://www.boardui.com/components/activity-rings-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add activity-rings-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { ActivityRingsCard } from "@/components/application/medical/activity-rings-card";

export function Example() {
  // Pass a selectedDay (from MostActiveDaysCard) to show that day's rings.
  return <ActivityRingsCard />;
}
```

### Most Active Days Card

Continuous vertical month calendar with per-day mini activity rings.

- Docs: https://www.boardui.com/components/most-active-days-card
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add most-active-days-card`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { useState } from "react";
import { ActivityRingsCard } from "@/components/application/medical/activity-rings-card";
import type { SelectedDay } from "@/components/application/medical/medical-data";
import { MostActiveDaysCard } from "@/components/application/medical/most-active-days-card";

export function Example() {
  // Clicking a day in the calendar drives the Activity card's rings.
  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>({ month: 6, day: 10 });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <MostActiveDaysCard selectedDay={selectedDay} onSelectDay={setSelectedDay} />
      <ActivityRingsCard selectedDay={selectedDay} />
    </div>
  );
}
```

## Pro templates

Each installs a complete route plus the component subtree it uses.

### Home Dashboard Template

KPI stat cards, revenue trend, earnings chart, contributions heatmap, and a customers table in a responsive app shell.

- Docs: https://www.boardui.com/components/home-dashboard
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add template-home-dashboard`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { DashboardShell } from "@/components/application/dashboard/dashboard-shell";

export default function DashboardPage() {
  // Full screen: floating sidebar, header, KPI cards,
  // earnings bar chart, and the customers data table.
  return <DashboardShell />;
}
```

### Marketing Dashboard Template

Campaign KPIs, acquisition funnel, spend by channel, traffic sources, ad spend vs. ROAS, visitors by channel, and a campaigns data table.

- Docs: https://www.boardui.com/components/marketing-dashboard
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add template-marketing`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { MarketingShell } from "@/components/application/marketing/marketing-shell";

export default function MarketingPage() {
  // Full screen: campaign KPIs, acquisition funnel, spend by
  // channel gauge, traffic sources, ad spend vs. ROAS combo,
  // visitors area chart, and the campaigns data table.
  return <MarketingShell />;
}
```

### Finance Dashboard Template

Balance KPIs, a cash-flow sankey, spending rings, portfolio bubbles, a daily spending heatmap, and a transactions data table.

- Docs: https://www.boardui.com/components/finance-dashboard
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add template-finance`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { FinanceShell } from "@/components/application/finance/finance-shell";

export default function FinancePage() {
  // Full screen: balance KPIs, the cash-flow sankey, spending
  // rings, portfolio risk vs. return bubbles, a daily spending
  // heatmap, and the transactions data table.
  return <FinanceShell />;
}
```

### HR Management Template

Headcount KPIs, recent hires, hiring pipeline, engagement radar, hires vs. attrition, team breakdowns, and an employees data table.

- Docs: https://www.boardui.com/components/hr-management
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add template-hr`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { HrShell } from "@/components/application/hr/hr-shell";

export default function HrPage() {
  // Full screen: headcount KPIs, recent hires, the hiring
  // pipeline, the engagement score radar, hires vs. attrition,
  // team breakdowns, and the employees data table.
  return <HrShell />;
}
```

### Medical Report Template

Patient overview with steps, sleep score, activity rings, and most-active-days charts.

- Docs: https://www.boardui.com/components/medical-profile
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add template-medical-profile`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { MedicalShell } from "@/components/application/medical/medical-shell";

export default function MedicalProfilePage() {
  // Full screen: patient info, steps and sleep score charts,
  // most active days calendar paired with activity rings,
  // alerts feed, and the patients data table.
  return <MedicalShell />;
}
```

### AI Chat Template

Full AI chat app: sidebar, resizable code panel, composer with model/effort controls.

- Docs: https://www.boardui.com/components/ai-chat
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add template-ai-chat`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { AiChatShell } from "@/components/application/ai-chat/ai-chat-shell";

export default function AiChatPage() {
  // Full screen: agent sidebar with repositories,
  // chat thread with composer and status bar,
  // and the fixed-width changes/code panel.
  return <AiChatShell />;
}
```

### AI Profile Template

AI contributions profile: cover card with activity heatmap, 30-day agents bar chart, and tokens trend chart.

- Docs: https://www.boardui.com/components/ai-profile
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add template-ai-profile`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { AiProfileShell } from "@/components/application/ai-profile/ai-profile-shell";

export default function AiProfilePage() {
  // Full screen: profile card with cover photo, contribution
  // stats and activity heatmap, the 30-day agents bar chart with
  // month switcher, and the tokens trend chart.
  return <AiProfileShell />;
}
```

### AI Image Generation Template

Prompt thread with a live generation frame and feedback actions, plus a gallery panel of past generations.

- Docs: https://www.boardui.com/components/ai-image-generation
- Install: `npx boardui@latest login YOUR_LICENSE_KEY` once, then `npx boardui@latest add template-ai-image-generation`. Requires a BoardUI Pro license (https://www.boardui.com/pricing).

Usage:

```tsx
import { AiChatShell } from "@/components/application/ai-chat/ai-chat-shell";

export default function AiImageGenerationPage() {
  // Same shell as AI Chat, opened on the image-generation
  // thread: the right panel becomes the generations gallery.
  return <AiChatShell defaultScenario="image-generation" />;
}
```
