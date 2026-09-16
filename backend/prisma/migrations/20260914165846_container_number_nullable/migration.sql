-- Support "Open Booking" (customer flowchart Must Have #2): a drayage job
-- can be booked with a size and booking number before the shipping line
-- assigns a container, so ShippingContainer.containerNumber is no longer
-- required at creation. The unique index still holds once a number is set.

-- AlterTable
ALTER TABLE "ShippingContainer" ALTER COLUMN "containerNumber" DROP NOT NULL;
