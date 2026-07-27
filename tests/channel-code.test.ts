import { describe, expect, it } from "vitest";
import { extractChannelCode, villageChannelFormSchema } from "@/lib/validations";

/**
 * The channel code used to be a second field on the dashboard, which asked a
 * coordinator to find the same string twice and let the two disagree — alerts
 * addressed to one channel, residents following another, nothing on screen to
 * show it. It is derived from the invite link now, so this function is the only
 * thing that sets `Village.whatsappChannelId` from the application.
 *
 * The failure that matters is a **silent** one: a link that yields no code with
 * posting switched on is a switch that reads as on and does nothing. Hence the
 * group-link cases below — a group invite is the link a coordinator is most
 * likely to paste by mistake, because it comes from the same app and looks the
 * same.
 */

describe("extractChannelCode", () => {
  it("reads the code out of the link WhatsApp gives a channel owner", () => {
    expect(extractChannelCode("https://whatsapp.com/channel/0029VaBcDeFgHiJkLmNoPq")).toBe(
      "0029VaBcDeFgHiJkLmNoPq",
    );
  });

  it("accepts the chat. host as well as the bare one", () => {
    // WhatsApp has used both, and pinning one breaks the day they add a third.
    expect(
      extractChannelCode("https://chat.whatsapp.com/channel/0029Va1234567890"),
    ).toBe("0029Va1234567890");
  });

  it("survives a tracking query string and a trailing slash", () => {
    expect(
      extractChannelCode("https://whatsapp.com/channel/0029VaXyZ?utm_source=share"),
    ).toBe("0029VaXyZ");
    expect(extractChannelCode("https://whatsapp.com/channel/0029VaXyZ/")).toBe(
      "0029VaXyZ",
    );
  });

  it("finds the link inside a message somebody pasted", () => {
    expect(
      extractChannelCode(
        "Follow us here: https://whatsapp.com/channel/0029VaPasted — thanks!",
      ),
    ).toBe("0029VaPasted");
  });

  it("returns null for a group invite link", () => {
    // The common mistake. A group link has no `/channel/` segment, and sending
    // a village's public alerts to a group would be a different disclosure to a
    // different audience.
    expect(extractChannelCode("https://chat.whatsapp.com/JqRsTuVwXyZ0123456")).toBeNull();
    expect(extractChannelCode("https://whatsapp.com/invite/JqRsTuVwXyZ")).toBeNull();
  });

  it("returns null for anything that is not a channel link", () => {
    expect(extractChannelCode("")).toBeNull();
    expect(extractChannelCode("the parish noticeboard")).toBeNull();
    expect(extractChannelCode("https://example.com/channel/0029Va")).toBeNull();
    expect(extractChannelCode("https://whatsapp.com/channel/")).toBeNull();
    // Says nothing about the protocol — `isHttpsUrl` is the separate check, and
    // the schema below is where the two meet.
    expect(extractChannelCode("http://whatsapp.com/channel/0029VaInsecure")).toBe(
      "0029VaInsecure",
    );
  });
});

describe("villageChannelFormSchema", () => {
  const form = {
    whatsappChannelUrl: "https://whatsapp.com/channel/0029VaBcDeFgHiJkLmNoPq",
    whatsappEnabled: "on" as const,
    whatsappMinSeverity: "HIGH",
  };

  it("derives the channel id from the link rather than accepting one", () => {
    const parsed = villageChannelFormSchema.safeParse({
      ...form,
      // Anything posted under this name is ignored: the transform is the only
      // thing that sets the column.
      whatsappChannelId: "0029VaSomebodyElsesChannel",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.whatsappChannelId).toBe("0029VaBcDeFgHiJkLmNoPq");
    expect(parsed.data.whatsappEnabled).toBe(true);
  });

  it("rejects a link that is not https", () => {
    // A `javascript:` URL rendered into /settings is stored XSS against the
    // whole village.
    expect(
      villageChannelFormSchema.safeParse({
        ...form,
        whatsappChannelUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("rejects a group link with a message naming the shape of a channel link", () => {
    const parsed = villageChannelFormSchema.safeParse({
      ...form,
      whatsappChannelUrl: "https://chat.whatsapp.com/JqRsTuVwXyZ0123456",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0].message).toMatch(/not a channel link/);
  });

  it("refuses posting switched on with no channel behind it", () => {
    const parsed = villageChannelFormSchema.safeParse({
      ...form,
      whatsappChannelUrl: "",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0].message).toMatch(/silently do nothing/);
  });

  it("accepts an empty link while posting is off", () => {
    const parsed = villageChannelFormSchema.safeParse({
      whatsappChannelUrl: "",
      whatsappEnabled: "",
      whatsappMinSeverity: "HIGH",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.whatsappChannelUrl).toBeNull();
    expect(parsed.data.whatsappChannelId).toBeNull();
    expect(parsed.data.whatsappEnabled).toBe(false);
  });
});
