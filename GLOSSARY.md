# easyRecharge

A Swiss marketplace that collects quote requests for EV chargers and home batteries and sends them to installer partners, who pay per lead.

## Leads and partners

**Lead**:
A customer's quote request for one product, as submitted through the quote funnel.
_Avoid_: Submission (that's the stored form record), request

**Partner**:
An installer company that receives Leads and is invoiced for them.
_Avoid_: Installer, client

**Dispatch**:
One Lead sent to one Partner; the unit the Partner works, and the unit that is billed.
_Avoid_: Assignment, lead (when the Partner-specific copy is meant)

## Dispatch lifecycle

**Stage**:
Where a Dispatch sits in the Partner's pipeline: new, contacted, appointment, quote sent, won or lost. Stages only move forward.
_Avoid_: Status (that's the Dispatch's delivery state), column

**Close**:
Moving a Dispatch to won or lost. Lost is possible from contacted onward, won from appointment onward; a closed Dispatch may swap between won and lost.
_Avoid_: Finish, complete

**Reopen**:
Returning a closed Dispatch to the Stage it was closed from. The only backward move, and it never releases the Billing lock.

**Disqualification**:
A Partner declaring a Dispatch unworkable (already known, wrong contact info…) before the Acceptance window ends. A disqualified Dispatch is never billable and is no longer a sales outcome.
_Avoid_: Rejection, lost (lost is a sales outcome, not a disqualification)

**Requalification**:
An admin undoing a Disqualification.

**Acceptance window**:
The number of days after dispatch during which a Partner may still disqualify; once it ends, the Dispatch counts as accepted.
_Avoid_: Grace period

**Billing lock**:
The moment a Dispatch becomes definitively billable: reaching quote sent or a Close, or the Acceptance window ending. Gifts and disqualified Dispatches never lock as billable.

**Gift**:
A Dispatch given to a Partner free of charge.

**Actor**:
Who is acting on a Dispatch: the Partner (from the board or from an e-mail link), an admin, or the system (scheduled jobs). Admins may override the Partner's rules, but never on a Dispatch that sits on a live invoice.

**Lifecycle event**:
A notice that something happened to a Dispatch (Stage changed, disqualified, reminder due), sent out to the automation platform.
_Avoid_: Webhook (that's the delivery mechanism)
