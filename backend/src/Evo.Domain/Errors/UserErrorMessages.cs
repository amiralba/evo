namespace Evo.Domain.Errors;

/// <summary>
/// Turkish, user-facing title/message text per stable error code — curated in code (not a DB
/// table: error text is part of the API contract, deploy-reviewed like any other code change,
/// and must never sit on the same failure path as the database). The panel displays these
/// directly; it never needs its own translation map. Unmapped codes fall back to a generic pair.
/// </summary>
public static class UserErrorMessages
{
    public sealed record Entry(string Title, string Message);

    private static readonly Entry Fallback = new("Beklenmeyen hata", "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");

    private static readonly Dictionary<string, Entry> Catalog = new()
    {
        [ErrorCodes.ValidationError] = new("Geçersiz bilgi", "Girdiğiniz bilgilerde bir sorun var. Lütfen kontrol edip tekrar deneyin."),
        [ErrorCodes.NotFound] = new("Bulunamadı", "Aradığınız kayıt bulunamadı."),
        [ErrorCodes.Conflict] = new("Çakışma", "Bu işlem mevcut bir kayıtla çakışıyor."),
        [ErrorCodes.Unauthorized] = new("Giriş gerekli", "Devam etmek için giriş yapmanız gerekiyor."),
        [ErrorCodes.Forbidden] = new("Yetkiniz yok", "Bu işlem için yetkiniz bulunmuyor."),
        [ErrorCodes.InternalError] = Fallback,
        [ErrorCodes.AuthInvalidCredentials] = new("Giriş başarısız", "E-posta veya parola hatalı."),
        [ErrorCodes.AuthAccountInactive] = new("Hesap pasif", "Hesabınız pasif durumda. Yöneticinizle iletişime geçin."),
        [ErrorCodes.AuthLockedOut] = new("Hesap kilitli", "Çok fazla başarısız deneme nedeniyle hesabınız geçici olarak kilitlendi."),
    };

    public static Entry For(string code) => Catalog.GetValueOrDefault(code, Fallback);
}
