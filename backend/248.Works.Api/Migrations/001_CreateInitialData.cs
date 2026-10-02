using Works.Api.Data;

namespace Works.Api.Migrations;

public sealed class CreateInitialData : IMigration
{
    public string Id => "001_create_initial_data";

    private readonly CosmosDataStore _store;

    public CreateInitialData(CosmosDataStore store)
    {
        _store = store;
    }

    public async Task UpAsync(CancellationToken cancellationToken = default)
    {
        var documents = new object[]
        {
            new
            {
                id = "job-001",
                type = "job",
                title = "Retail Sales Executive",
                company = "GreenMart Retail",
                location = "Nizampet",
                salary = "₹14,000–₹18,000",
                category = "Sales",
                employmentType = "Full-time",
                posted = DateTime.UtcNow,
                description = "Assist customers, maintain product displays and achieve daily store sales targets.",
                skills = new[] { "Customer handling", "Sales", "Telugu" },
                vacancies = 3,
                status = "open"
            },
            new
            {
                id = "job-002",
                type = "job",
                title = "Cashier / POS Operator",
                company = "Daily Needs Supermarket",
                location = "Bachupally",
                salary = "₹13,000–₹17,000",
                category = "Cashier",
                employmentType = "Full-time",
                posted = DateTime.UtcNow,
                description = "Operate POS billing, handle cash and UPI payments, and support reconciliation.",
                skills = new[] { "POS", "Billing", "Basic computer skills" },
                vacancies = 2,
                status = "open"
            }
        };

        foreach (var document in documents)
        {
            var json = System.Text.Json.JsonSerializer.Serialize(document);
            using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));
            using var documentReader = new StreamReader(stream);
            var text = await documentReader.ReadToEndAsync(cancellationToken);
            using var itemStream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(text));

            await _store.Container.UpsertItemStreamAsync(
                itemStream,
                document.GetType().GetProperty("id")!.GetValue(document)!.ToString()!,
                new Microsoft.Azure.Cosmos.PartitionKey("job"),
                cancellationToken: cancellationToken);
        }
    }
}
