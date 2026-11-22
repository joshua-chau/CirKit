"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { Bell } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { NotificationType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import type { NotificationList } from "@/server/notifications/notification.service";

const notificationTitles: Record<NotificationType, string> = {
  REQUEST_APPROVED: "Borrowing request approved",
  REQUEST_CREATED: "New borrowing request received",
  REQUEST_DECLINED: "Borrowing request declined",
  REQUEST_CANCELLED: "Borrowing request cancelled",
  ITEM_RETURNED: "Borrowed item returned",
  GROUP_INVITED: "Group invitation received",
  GROUP_MEMBER_REMOVED: "You were removed from a group",
};
const notificationTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<NotificationList | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [readError, setReadError] = useState(false);
  const [pendingReadId, setPendingReadId] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [refreshVersion, refreshNotifications] = useReducer((version: number) => version + 1, 0);
  const streamRef = useRef<EventSource | null>(null);
  const hasUnread = (list?.unreadCount ?? 0) > 0;

  useEffect(() => {
    const stream = new EventSource("/api/notifications/stream");
    streamRef.current = stream;
    stream.addEventListener("ready", refreshNotifications);
    stream.addEventListener("notification.changed", refreshNotifications);

    return () => {
      stream.close();
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadNotifications() {
      try {
        const response = await fetch("/api/notifications", { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          streamRef.current?.close();
          setList(null);
        }
        if (!response.ok) throw new Error("Could not load notifications.");

        const { data }: { data: NotificationList } = await response.json();
        if (controller.signal.aborted) return;
        setList(data);
        setLoadError(false);
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      }
    }

    const timer = window.setTimeout(() => void loadNotifications(), 50);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [refreshVersion]);

  async function openUnreadNotification(notificationId: string, href: string) {
    setPendingReadId(notificationId);
    setReadError(false);

    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
        method: "PATCH",
      });
      if (!response.ok) throw new Error("Could not mark the notification as read.");
      refreshNotifications();
      setOpen(false);
      router.push(href);
    } catch {
      setReadError(true);
    } finally {
      setPendingReadId(null);
    }
  }

  async function markAllAsRead() {
    setMarkingAllRead(true);
    setReadError(false);

    try {
      const response = await fetch("/api/notifications/read-all", { method: "PATCH" });
      if (!response.ok) throw new Error("Could not mark notifications as read.");
      refreshNotifications();
    } catch {
      setReadError(true);
    } finally {
      setMarkingAllRead(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) refreshNotifications();
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        aria-label={hasUnread ? "Notifications (unread)" : "Notifications"}
        title="Notifications"
        className={buttonVariants({ variant: "ghost", size: "icon-lg", className: "relative" })}
      >
        <Bell className="size-5" aria-hidden="true" />
        {hasUnread && (
          <span aria-hidden="true" className="absolute top-1 right-1 size-2 rounded-full bg-primary" />
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={8} className="z-20">
          <Popover.Popup className="w-80 max-w-[calc(100vw_-_2rem)] space-y-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg [font-family:var(--font-geist-sans)]">
            <div className="flex items-center justify-between gap-3">
              <Popover.Title className="text-sm font-semibold">Notifications</Popover.Title>
              <Button
                type="button"
                variant="default"
                size="xs"
                className="rounded-lg"
                disabled={!hasUnread || markingAllRead || pendingReadId !== null}
                onClick={markAllAsRead}
              >
                {markingAllRead ? "Marking…" : "Mark all as read"}
              </Button>
            </div>
            {loadError && (
              <div className="flex items-center justify-between gap-2">
                <p role="alert" className="text-sm text-destructive">Could not load notifications.</p>
                <Button type="button" variant="outline" size="xs" onClick={refreshNotifications}>Try again</Button>
              </div>
            )}
            {!loadError && !list && <p role="status" className="text-sm text-muted-foreground">Loading notifications…</p>}
            {list?.notifications.length === 0 && <p className="text-sm text-muted-foreground">No notifications yet.</p>}
            {readError && <p role="alert" className="text-sm text-destructive">Could not mark notifications as read.</p>}
            {!!list?.notifications.length && (
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {list.notifications.map((notification) => {
                  const unread = notification.readAt === null;
                  const groupNotification = notification.type === "GROUP_INVITED" || notification.type === "GROUP_MEMBER_REMOVED";
                  const href = groupNotification
                    ? "/groups"
                    : notification.direction === "lending" && notification.requestId
                      ? `/lending-items?requestId=${encodeURIComponent(notification.requestId)}`
                      : "/borrowing-items";

                  return (
                    <li key={notification.id}>
                      <Link
                        href={href}
                        aria-busy={pendingReadId === notification.id}
                        className={cn(
                          "block cursor-pointer space-y-1 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none",
                          unread ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-muted",
                        )}
                        onNavigate={(event) => {
                          if (pendingReadId !== null || markingAllRead) {
                            event.preventDefault();
                            return;
                          }
                          if (unread) {
                            event.preventDefault();
                            void openUnreadNotification(notification.id, href);
                            return;
                          }
                          setOpen(false);
                        }}
                      >
                        {unread && <span className="sr-only">Unread</span>}
                        <p className="font-medium">{notificationTitles[notification.type]}</p>
                        <p className="break-words">
                          {groupNotification ? (notification.groupName ?? "Group no longer available") : notification.itemName}
                        </p>
                        <time dateTime={notification.createdAt} className="block text-xs opacity-75">
                          {notificationTime.format(new Date(notification.createdAt))}
                        </time>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
