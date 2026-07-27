import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type {
  IncidentStatus,
  IncidentType,
  Severity,
} from "../src/generated/prisma/enums";
import { fuzzCoordinates } from "../src/lib/geo";
import {
  LOCATION_FUZZ_METERS,
  VILLAGE_STATUS_LABELS,
} from "../src/lib/constants";

/**
 * Seeds one village with enough realistic data to see every screen working.
 *
 * Run it with `npm run db:seed`. `prisma migrate reset` runs it too, via
 * `migrations.seed` in `prisma.config.ts`.
 *
 * ## What it creates
 *
 * A village, one coordinator profile, five incidents across four statuses, the
 * tags the AI pass would have produced, and one `PatternAlert` dated to the week
 * before last — so the dashboard, the map, the incident list, the moderation
 * queue and the pattern alert all have something in them on first sign-in.
 *
 * ## Three things to know before running it
 *
 * 1. **`User.id` mirrors `auth.users.id`.** A profile row seeded with an
 *    invented uuid belongs to no Supabase auth user and cannot sign in. Register
 *    through `/register` first, copy your UID from Supabase → Authentication →
 *    Users, and set `SEED_ADMIN_USER_ID` before running this. Without it the
 *    seed still works — it makes up an id and says so — but you will be looking
 *    at the village through a different account.
 *
 * 2. **It is idempotent, and it does not clobber.** Everything is an `upsert`
 *    keyed on the natural key (village slug, user id, incident reference), and
 *    the `update` half is deliberately narrow: re-running will not resurrect a
 *    report a coordinator has since rejected, undo a role you changed by hand,
 *    or reactivate a village you deliberately took out of the picker — the
 *    village's `update` half is empty, so an existing row is left untouched and
 *    its status is only reported. Delete the rows if you want them rebuilt.
 *
 * 3. **It is sample data, and it reads like it.** The village is called
 *    `[Your Village]` and sits at the geographic centre of England, both of
 *    which are meant to be obviously a placeholder rather than a real parish.
 *    Set `SEED_VILLAGE_NAME` and edit `VILLAGE_CENTRE` for somewhere real.
 *
 * The seeded `rawDescription` values contain invented names and registrations
 * and the matching `description` values do not — that is the anonymisation
 * domain rule 1 describes, shown rather than asserted. Nothing here is a real
 * person, vehicle or address.
 */

// Match Next.js precedence, as `prisma.config.ts` does: .env.local wins.
config({ path: [".env.local", ".env"], quiet: true });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "No DIRECT_URL or DATABASE_URL. Copy .env.example to .env.local and fill " +
      "in the Supabase connection strings first.",
  );
  process.exit(1);
}

// The direct connection, not the pooled one — a seed runs a few dozen writes in
// sequence and has no reason to go through pgBouncer.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// ---------------------------------------------------------------------------
// The village
// ---------------------------------------------------------------------------

const VILLAGE_NAME = process.env.SEED_VILLAGE_NAME ?? "[Your Village]";
const VILLAGE_SLUG = "your-village";

/**
 * Fenny Drayton, Leicestershire — the traditional geographic centre of England.
 *
 * Chosen precisely because it is not anyone's parish: a seed that dropped five
 * invented crimes onto a real village's map would be a bad thing to leave lying
 * around in a public repository. Change it to the real centre before seeding
 * anything a resident will see.
 */
const VILLAGE_CENTRE = { lat: 52.561, lng: -1.464 };

const JOIN_CODE = "VILLAGE1";

// ---------------------------------------------------------------------------
// The coordinator
// ---------------------------------------------------------------------------

const ADMIN_USER_ID = process.env.SEED_ADMIN_USER_ID?.trim();
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "coordinator@example.uk";

/**
 * `COORDINATOR`, not `ADMIN`.
 *
 * `ADMIN` is the platform-wide role; the person who runs one village's watch
 * scheme is its coordinator. `COORDINATOR_ROLES` covers both, so either gets
 * into the dashboard, the moderation queue and the audit viewer — this is the
 * one that describes the job.
 */
const ADMIN_ROLE = "COORDINATOR";

// ---------------------------------------------------------------------------
// The incidents
// ---------------------------------------------------------------------------

type SeedIncident = {
  /** Days before now the incident happened. Reported a little after. */
  daysAgo: number;
  reportedHoursLater: number;
  type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  title: string;
  /** The reporter's own words — names, plates, the lot. Never public. */
  rawDescription: string;
  /** What the anonymisation pass would have written. This is what residents see. */
  description: string;
  locationText: string;
  /** Metres north/east of the village centre, before fuzzing. */
  offsetNorth: number;
  offsetEast: number;
  tags: readonly string[];
  peopleCount?: number;
  reportedToPolice?: boolean;
  policeReference?: string;
};

const INCIDENTS: readonly SeedIncident[] = [
  {
    daysAgo: 2,
    reportedHoursLater: 1,
    type: "VEHICLE_CRIME",
    severity: "MEDIUM",
    status: "PUBLISHED",
    title: "Van window smashed overnight by the Green",
    rawDescription:
      "Came out at half seven and the passenger window of my Transit (YK19 RTF) was in bits all over the verge. Toolbox gone from behind the seat. Dave at number 14 says he heard glass around 2am. Nothing else on the street looked touched.",
    description:
      "A van parked near the Green had its passenger window broken overnight and tools taken from inside. A neighbour reported hearing breaking glass at about 2am. No other vehicles on the street appeared to have been targeted.",
    locationText: "The Green, near the bus shelter",
    offsetNorth: 180,
    offsetEast: -120,
    tags: ["vehicle break-in", "overnight", "tools taken"],
    reportedToPolice: true,
    policeReference: "LP-24-118920",
  },
  {
    daysAgo: 4,
    reportedHoursLater: 14,
    type: "ANTISOCIAL_BEHAVIOUR",
    severity: "LOW",
    status: "PUBLISHED",
    title: "Group drinking and shouting at the recreation ground",
    rawDescription:
      "Six or seven lads on the rec until gone midnight again, music going, bottles everywhere by the swings this morning. One of them is the Harper boy from Mill Lane, I'd recognise him anywhere.",
    description:
      "A group of around six to seven people gathered at the recreation ground until after midnight, playing music loudly. Bottles were left near the play equipment and cleared the following morning.",
    locationText: "Recreation ground",
    offsetNorth: -240,
    offsetEast: 310,
    tags: ["noise", "litter", "late night", "recreation ground"],
    peopleCount: 7,
  },
  {
    daysAgo: 6,
    reportedHoursLater: 3,
    type: "BURGLARY",
    severity: "HIGH",
    status: "PUBLISHED",
    title: "Shed forced open on Church Row",
    rawDescription:
      "Someone's been through the shed at the back of 8 Church Row. Padlock cut clean off, mountain bike gone and the strimmer. Got over the fence from the footpath by the churchyard I reckon. Sarah two doors down had hers tried last month.",
    description:
      "A garden shed on Church Row was broken into, with the padlock cut. A bicycle and garden equipment were taken. Access appears to have been over the rear fence from the adjoining footpath. A nearby property reported an attempted shed break-in last month.",
    locationText: "Church Row, gardens backing onto the churchyard footpath",
    offsetNorth: 90,
    offsetEast: 260,
    tags: ["shed break-in", "rear access", "footpath", "bicycle taken"],
    reportedToPolice: true,
    policeReference: "LP-24-118644",
  },
  {
    daysAgo: 9,
    reportedHoursLater: 1,
    type: "ROAD_HAZARD",
    severity: "MEDIUM",
    status: "RESOLVED",
    title: "Fallen branch blocking Mill Lane",
    rawDescription:
      "Big limb down off the oak by the ford, taking up most of Mill Lane. Passable in a car if you're careful but not in the dark. I've rung the parish clerk, Margaret said she'd get on to highways.",
    description:
      "A large branch came down near the ford and blocked most of Mill Lane. The road was passable with care but hazardous after dark. Reported to the parish clerk for highways to clear.",
    locationText: "Mill Lane, by the ford",
    offsetNorth: -410,
    offsetEast: -280,
    tags: ["fallen tree", "road blocked", "after storm"],
  },
  {
    daysAgo: 11,
    reportedHoursLater: 2,
    type: "SUSPICIOUS_ACTIVITY",
    severity: "LOW",
    // Left in the queue on purpose: without one pending report the moderation
    // queue and the dashboard's "awaiting review" figure are both empty, which
    // is the least useful way to see a coordinator's screens for the first time.
    status: "PENDING_REVIEW",
    title: "Two callers claiming to be from the water board",
    rawDescription:
      "Couple of blokes knocking door to door saying they needed to check pressure inside, no ID when I asked, white Astra parked up on the verge, first two letters of the plate were GK. Told them to clear off and they went towards Oak Close. Elderly mum at number 3 nearly let them in.",
    description:
      "Two people called door to door claiming to be from the water board and asking to come inside to check pressure. Neither could produce identification when asked. They left in a car parked on the verge and headed towards Oak Close.",
    locationText: "Oak Close and the top of the High Street",
    offsetNorth: 330,
    offsetEast: 140,
    tags: ["doorstep callers", "no identification", "utility impersonation"],
    peopleCount: 2,
  },
];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

async function main() {
  const now = new Date();

  console.log(`Seeding ${VILLAGE_NAME}…`);

  const village = await seedVillage();
  const userId = await seedCoordinator(village.id);
  const incidents = await seedIncidents({ villageId: village.id, userId, now });
  await seedPatternAlert({ villageId: village.id, incidents, now });

  console.log("");
  console.log(`  Village        ${village.name} (join code ${JOIN_CODE})`);
  console.log(`  Status         ${VILLAGE_STATUS_LABELS[village.status]}`);
  console.log(`  Coordinator    ${ADMIN_EMAIL}`);
  console.log(`  Incidents      ${incidents.length}`);
  console.log("");

  // Only `ACTIVE` villages reach the register and welcome pickers, so a sample
  // village left at any other status is invisible to a new resident. That is a
  // legitimate thing to want — it is how you keep the placeholder out of a
  // picker showing real parishes — but it should never be a surprise.
  if (village.status !== "ACTIVE") {
    console.warn(
      `  ⚠  This village is ${VILLAGE_STATUS_LABELS[village.status]}, so it does\n` +
        "     not appear in the village picker on /register or /welcome and gets\n" +
        "     no weekly digest. The seed left it alone rather than reactivating\n" +
        "     it. Residents already in it are unaffected — nothing gates a signed\n" +
        "     in resident on village status. To put it back in the picker:\n" +
        "\n" +
        `       UPDATE villages SET status = 'ACTIVE' WHERE slug = '${VILLAGE_SLUG}';`,
    );
    console.log("");
  }

  if (!ADMIN_USER_ID) {
    console.warn(
      "  ⚠  SEED_ADMIN_USER_ID was not set, so the coordinator profile was\n" +
        "     given a made-up id and cannot sign in. Register at /register,\n" +
        "     then either set SEED_ADMIN_USER_ID to your Supabase auth UID and\n" +
        "     re-run this, or set your own profile's village_id and role by hand.",
    );
    console.log("");
  }
}

async function seedVillage() {
  return prisma.village.upsert({
    where: { slug: VILLAGE_SLUG },
    /*
      Empty on purpose: an existing village is left exactly as it is.

      Its name, centre and join code have probably been set for real, and
      `status` especially is a decision somebody made — deactivating the sample
      village is how you take it out of the register and welcome pickers, and a
      seed that flipped it back to `ACTIVE` would silently undo that on the next
      run. `seed-villages.ts` takes the same line for the same reason: anything
      past `PENDING` is a human's choice and survives a re-seed.

      A row that vanished from the picker unexpectedly is a bad way to find out
      the seed had an opinion about it, so `main()` reports the status it found
      rather than quietly leaving it alone.
    */
    update: {},
    create: {
      name: VILLAGE_NAME,
      slug: VILLAGE_SLUG,
      description:
        "Sample village created by the seed script. Rename it, move the centre, " +
        "and change the join code before anyone real joins.",
      status: "ACTIVE",
      centerLat: VILLAGE_CENTRE.lat,
      centerLng: VILLAGE_CENTRE.lng,
      defaultZoom: 15,
      radiusMeters: 3_000,
      region: "Leicestershire",
      country: "GB",
      timezone: "Europe/London",
      population: 640,
      joinCode: JOIN_CODE,
      alertThreshold: "HIGH",
      contactEmail: ADMIN_EMAIL,
    },
    select: { id: true, name: true, status: true },
  });
}

async function seedCoordinator(villageId: string): Promise<string> {
  const id = ADMIN_USER_ID ?? randomUUID();

  // `homeLat`/`homeLng` are set so notification-radius filtering has something
  // to measure from — a coordinator with no home location falls into the
  // village-wide audience, which is correct but hides the radius feature.
  const home = fuzzCoordinates(
    VILLAGE_CENTRE.lat,
    VILLAGE_CENTRE.lng,
    LOCATION_FUZZ_METERS,
  );

  const user = await prisma.user.upsert({
    where: { id },
    // Only what the seed is actually for: putting this person in this village
    // with the role that can moderate. Never touches notification preferences
    // or a verification a coordinator granted.
    update: { villageId, role: ADMIN_ROLE },
    create: {
      id,
      email: ADMIN_EMAIL,
      fullName: "Village Coordinator",
      role: ADMIN_ROLE,
      villageId,
      homeLat: home.lat,
      homeLng: home.lng,
      verifiedAt: new Date(),
      notifyPush: true,
      notifyMinSeverity: "LOW",
      onboardedAt: new Date(),
    },
    select: { id: true },
  });

  return user.id;
}

type SeededIncident = { id: string; occurredAt: Date; severity: Severity };

async function seedIncidents(input: {
  villageId: string;
  userId: string;
  now: Date;
}): Promise<SeededIncident[]> {
  const seeded: SeededIncident[] = [];

  for (const [index, incident] of INCIDENTS.entries()) {
    const occurredAt = new Date(input.now.getTime() - incident.daysAgo * DAY_MS);
    const reportedAt = new Date(
      occurredAt.getTime() + incident.reportedHoursLater * HOUR_MS,
    );

    const reference = `VW-${occurredAt.getFullYear()}-${String(index + 1).padStart(4, "0")}`;

    // Offset from the village centre, then jittered exactly as a real report is
    // on the way in (domain rule 2). The seed has no privacy to protect, but a
    // pin sitting on a suspiciously round offset would look like a bug.
    const placed = offsetMetres(
      VILLAGE_CENTRE,
      incident.offsetNorth,
      incident.offsetEast,
    );
    const point = fuzzCoordinates(placed.lat, placed.lng, LOCATION_FUZZ_METERS);

    const published =
      incident.status === "PUBLISHED" || incident.status === "RESOLVED";

    const row = await prisma.incident.upsert({
      where: { reference },
      // Nothing. If this reference exists, a coordinator may have moderated it
      // since — re-running the seed must not put a rejected report back on the
      // map. `update: {}` keeps the upsert idempotent without overwriting.
      update: {},
      create: {
        reference,
        villageId: input.villageId,
        reporterId: input.userId,
        type: incident.type,
        severity: incident.severity,
        status: incident.status,
        source: "WEB",
        title: incident.title,
        rawDescription: incident.rawDescription,
        description: incident.description,
        anonymized: true,
        aiModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
        aiProcessedAt: reportedAt,
        aiConfidence: 0.9,
        peopleCount: incident.peopleCount,
        occurredAt,
        reportedAt,
        resolvedAt: incident.status === "RESOLVED" ? reportedAt : null,
        locationText: incident.locationText,
        // lat/lng only — `location_point` is derived by the PostGIS trigger.
        lat: point.lat,
        lng: point.lng,
        locationFuzzMeters: LOCATION_FUZZ_METERS,
        reportedToPolice: incident.reportedToPolice ?? false,
        policeReference: incident.policeReference,
        moderatedById: published ? input.userId : null,
        moderatedAt: published ? reportedAt : null,
        viewCount: published ? 8 + index * 5 : 0,
        tags: {
          create: incident.tags.map((label) => ({
            label,
            source: "ai",
            confidence: 0.85,
          })),
        },
      },
      select: { id: true, occurredAt: true, severity: true, status: true },
    });

    seeded.push(row);
  }

  return seeded;
}

/**
 * One `PatternAlert` dated to the week before last.
 *
 * The digest is what creates these in production, and it only runs on a Sunday
 * — so a fresh database has nothing to show on the pattern side until the first
 * cron fires. This is that first digest, backdated, linked to whichever seeded
 * incidents fall inside its window.
 */
async function seedPatternAlert(input: {
  villageId: string;
  incidents: readonly SeededIncident[];
  now: Date;
}) {
  const windowEnd = new Date(input.now.getTime() - 7 * DAY_MS);
  const windowStart = new Date(input.now.getTime() - 14 * DAY_MS);

  const inWindow = input.incidents.filter(
    (incident) =>
      incident.occurredAt >= windowStart && incident.occurredAt <= windowEnd,
  );

  if (inWindow.length === 0) return;

  const existing = await prisma.patternAlert.findFirst({
    where: { villageId: input.villageId, windowStart, detector: "seed" },
    select: { id: true },
  });

  if (existing) return;

  await prisma.patternAlert.create({
    data: {
      villageId: input.villageId,
      title: `${inWindow.length} report${inWindow.length === 1 ? "" : "s"} the week before last`,
      summary: [
        `${inWindow.length} incidents were published in the village over that week, both towards the west side.`,
        "Mill Lane: a fallen branch blocked the road near the ford until highways cleared it.",
        "Doorstep callers were reported at the top of the High Street. Ask for identification and close the door while you check.",
      ].join("\n\n"),
      type: "OTHER",
      severity: "MEDIUM",
      incidentCount: inWindow.length,
      windowStart,
      windowEnd,
      centroidLat: VILLAGE_CENTRE.lat,
      centroidLng: VILLAGE_CENTRE.lng,
      radiusMeters: 400,
      confidence: 0.62,
      // Not "claude-weekly-digest": no model wrote this, and a seeded row
      // claiming a provenance it does not have would be a lie in the data.
      detector: "seed",
      notifiedAt: windowEnd,
      incidents: { connect: inWindow.map((incident) => ({ id: incident.id })) },
    },
  });
}

/**
 * Moves a point by a north/east offset in metres.
 *
 * Flat-earth approximation, which over the few hundred metres a village spans
 * is accurate to well inside the fuzz radius applied straight afterwards.
 */
function offsetMetres(
  origin: { lat: number; lng: number },
  north: number,
  east: number,
): { lat: number; lng: number } {
  const metresPerDegreeLat = 111_320;
  const metresPerDegreeLng =
    metresPerDegreeLat * Math.cos((origin.lat * Math.PI) / 180);

  return {
    lat: origin.lat + north / metresPerDegreeLat,
    lng: origin.lng + east / metresPerDegreeLng,
  };
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
