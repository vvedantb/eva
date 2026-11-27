import { createFileRoute, redirect } from "@tanstack/react-router";
import { REVIEW_DEFAULT_TAB, canonicalReviewTab } from "@/lib/search-params";
import { ReviewDetailClient } from "@/lib/components/reviews/ReviewDetailClient";

export const Route = createFileRoute(
  "/_repo/$owner/$repo/reviews/$prNumber/$reviewTab",
)({
  beforeLoad: ({ params }) => {
    // Unknown slugs fall back to the default tab; the old `diff` slug maps onto
    // the canonical `diffs` the sandbox already used. Pull requests is a
    // sandbox tab: this page is already one pull request.
    const mapped = canonicalReviewTab(params.reviewTab);
    const canonical = mapped === "prs" ? REVIEW_DEFAULT_TAB : mapped;
    if (canonical !== params.reviewTab) {
      throw redirect({
        to: "/$owner/$repo/reviews/$prNumber/$reviewTab",
        params: {
          owner: params.owner,
          repo: params.repo,
          prNumber: params.prNumber,
          reviewTab: canonical ?? REVIEW_DEFAULT_TAB,
        },
        search: (prev) => prev,
        replace: true,
      });
    }
  },
  component: ReviewDetailTabPage,
});

function ReviewDetailTabPage() {
  const { prNumber, reviewTab } = Route.useParams();
  return (
    <ReviewDetailClient prNumberParam={prNumber} reviewTabParam={reviewTab} />
  );
}
