namespace Works.Api.Migrations;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection Add248WorksMigrations(this IServiceCollection services)
    {
        services.AddSingleton<IMigration, CreateInitialData>();
        return services;
    }
}
