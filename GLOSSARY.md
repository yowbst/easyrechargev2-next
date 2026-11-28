# easyRecharge

A Swiss marketplace that collects quote requests for EV chargers and home batteries and sends them to installer partners, who pay per lead.

## Leads and partners

**Product**:
The kind of installation a Lead asks for: charger or home battery today.
_Avoid_: Vertical, service, offer

**Lead**:
A customer's quote request for one Product, as submitted through the quote funnel.
_Avoid_: Submission (that's the stored form record), request

**Partner**:
A company that receives Leads and is invoiced for them; a commercial relationship, not a kind of company. Linked to at most one Company, the legal entity it is invoiced under.
_Avoid_: Installer (that's a classification of a Company), client

**Active**:
Said of a Partner enrolled to receive Leads and not paused. Reaching a quota limits Dispatch, not being Active.
_Avoid_: Live, enabled

**Dispatch**:
One Lead sent to one Partner; the unit the Partner works, and the unit that is billed.
_Avoid_: Assignment, lead (when the Partner-specific copy is meant)

**Area**:
A canton in which a Partner receives Leads for a Product. Exclusive when that Partner alone gets the canton's Leads, shared otherwise.
_Avoid_: Region, zone, territory

**Served canton**:
A canton where easyRecharge actively sells installation, chosen by the owner; it can exist without any Area.
_Avoid_: Covered canton (coverage is the Areas)

## Register companies

**Company**:
A business from the commercial register kept in our dataset, whatever its trade.
_Avoid_: Business, entreprise, firm

**Installer**:
A Company whose registered purpose describes electrical installation work.
_Avoid_: Electrician (page wording only), partner

**Listed**:
Said of a Company shown on public pages. A Company withdrawn at its own request is Hidden. A link to an Active Partner lists a Company; liquidation never does.
_Avoid_: Published, visible, active

**Prospect**:
An Installer chosen for outreach about becoming a Partner.
_Avoid_: Lead (that's a customer request), candidate

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
