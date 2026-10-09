# 248 Works

**Connecting People, Empowering Businesses**

React + Vite MVP for a local workforce marketplace.

## MVP modules

- Job seekers: free registration concept, job discovery, filters, applications.
- Job providers: ₹100 joining-fee concept, job posting and provider dashboard.
- Responsive mobile-first interface.
- Swappable data service so the UI can move from mock data to the 248 Works API without rewriting the screens.
- Account workspace: editable role-aware profiles, application tracking with status filters, searchable saved jobs, and saved job-search alerts.
- Job alerts currently store search preferences per signed-in account in that browser profile; outbound email and push notifications are not enabled.

## Azure target

- Resource group: `rg-248-works`
- Cosmos account: `cosmos-248-works`
- Database: `248WorksDB`
- Container: `248Data`
- Partition key: `/type`
- Current provisioned throughput: 400 RU/s
- Region: Central India
- Lifetime free-tier account: enabled

## Run locally

```bash
npm install
npm run dev
```

## Security

Do not put Cosmos DB keys in React/browser code. The production architecture should be:

React -> .NET 8 Web API -> Azure Cosmos DB.

The API will hold the Cosmos credential/managed identity and enforce authentication, authorization, provider payment status and application rules.

## Next implementation phase

1. .NET 8 API + Cosmos repository.
2. Authentication for job seekers/providers/admin.
3. Razorpay ₹100 provider onboarding payment.
4. Cosmos persistence for candidates, providers, jobs, applications and payments.
5. Admin dashboard and deployment configuration.
