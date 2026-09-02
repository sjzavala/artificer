/**
 * The Artificer mark: a pair of drafting dividers.
 *
 * An artificer makes things to a tolerance, and dividers are the instrument for
 * that — you set them once and every measurement after agrees. That is the
 * product's argument in one object: a value is not eyeballed, it is taken from
 * the document and checked against it.
 *
 * It was drawn first as dividers that were *also* the letter A, with a crossbar
 * doing double duty. Rendered at sixteen, twenty-two, thirty and fifty-six
 * pixels beside the alternatives, the letter won every time — it read as an A
 * with a stray dot over it rather than as a tool. The crossbar was the whole
 * problem, so it is gone. What is left cannot be mistaken for type at any size,
 * which matters more than the pun did.
 */
export function Mark({ className = '', accent = 'currentColor' }: { className?: string; accent?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Two legs, splayed from the pivot. */}
      <path d="M12 6 L5.2 19.6" />
      <path d="M12 6 L18.8 19.6" />
      {/* The pivot sits on the joint, in the accent — the one coloured thing in
          the mark, matching the colour the product reserves for decisions. */}
      <circle cx="12" cy="6" r="2.3" fill={accent} stroke="none" />
    </svg>
  );
}
