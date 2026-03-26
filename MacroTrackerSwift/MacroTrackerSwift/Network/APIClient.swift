import Foundation

// MARK: - ApiError

struct ApiError: Error, LocalizedError, Sendable {
    let statusCode: Int
    let message:    String

    var errorDescription: String? { "[\(statusCode)] \(message)" }
}

// MARK: - APIClient

/// Full REST client. Port of mobile/services/api.ts.
/// @MainActor (not actor) so that model types — which inherit default MainActor isolation
/// from SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor — can be decoded without crossing actor domains.
/// URLSession async/await suspends MainActor without blocking the thread, so this is fine.
@MainActor final class APIClient {
    static let shared = APIClient()

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    private init() {}

    // MARK: - Core Request

    /// GET — no request body.
    private func get<T: Decodable>(_ path: String) async throws -> T {
        try await perform(path, method: "GET", jsonBody: nil)
    }

    /// POST / PUT / PATCH — encodes a body.
    private func post<T: Decodable, B: Encodable>(_ path: String, method: String = "POST",
                                                    body: B) async throws -> T {
        try await perform(path, method: method, jsonBody: try encoder.encode(body))
    }

    /// DELETE / fire-and-forget mutations with no decoded response.
    private func delete(_ path: String) async throws {
        let _: EmptyResponse = try await perform(path, method: "DELETE", jsonBody: nil)
    }

    private func deleteWithBody<B: Encodable>(_ path: String, method: String = "DELETE",
                                               body: B) async throws {
        let _: EmptyResponse = try await perform(path, method: method,
                                                  jsonBody: try encoder.encode(body))
    }

    private func perform<T: Decodable>(_ path: String, method: String,
                                        jsonBody: Data?) async throws -> T {
        let urlStr = Config.baseURL + path
        guard let url = URL(string: urlStr) else {
            throw ApiError(statusCode: 0, message: "Invalid URL: \(urlStr)")
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        if let body = jsonBody {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = body
        }

        #if DEBUG
        print("[API] \(method) \(urlStr)")
        #endif

        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        #if DEBUG
        print("[API] \(method) \(path) → \(status)")
        #endif

        guard (200..<300).contains(status) else {
            let raw = String(data: data, encoding: .utf8) ?? ""
            var message = raw.isEmpty ? "Request failed: \(status)" : raw
            if let parsed = try? JSONDecoder().decode([String: String].self, from: data),
               let err = parsed["error"] {
                message = err
            }
            throw ApiError(statusCode: status, message: message)
        }

        if T.self == EmptyResponse.self {
            return EmptyResponse() as! T
        }
        return try decoder.decode(T.self, from: data)
    }

    // MARK: - Goals

    func getGoalsForDate(_ date: String) async throws -> GoalForDateResponse {
        let qs = date.isEmpty ? "" : "?date=\(date.urlEncoded)"
        return try await get("/api/goals\(qs)")
    }

    func changeGoals(_ data: UpdateGoalsForDateRequest) async throws -> GoalForDateResponse {
        return try await post("/api/goals/change", body: data)
    }

    func getGoalProfiles() async throws -> GoalProfilesResponse {
        return try await get("/api/goal-profiles")
    }

    // MARK: - Profile

    func getProfile() async throws -> UserProfile {
        return try await get("/api/profile")
    }

    func updateProfile(_ profile: UserProfile) async throws -> UserProfile {
        return try await post("/api/profile", method: "PUT", body: profile)
    }

    // MARK: - Preferences

    func getUserPreferences() async throws -> UserPreferences {
        return try await get("/api/user/preferences")
    }

    func updateUserPreferences(_ data: UserPreferences) async throws -> UserPreferences {
        return try await post("/api/user/preferences", method: "PATCH", body: data)
    }

    // MARK: - Food Entries

    func getEntries(date: String) async throws -> [FoodEntry] {
        return try await get("/api/food/entries?date=\(date)")
    }

    func createEntry(_ data: CreateFoodEntryRequest) async throws -> FoodEntry {
        return try await post("/api/food/entries", body: data)
    }

    func updateEntry(id: String, data: UpdateFoodEntryRequest) async throws -> FoodEntry {
        return try await post("/api/food/entries/\(id)", method: "PUT", body: data)
    }

    func deleteEntry(id: String) async throws {
        try await delete("/api/food/entries/\(id)")
    }

    func getFrequentFoods() async throws -> [FrequentFood] {
        return try await get("/api/food/entries/frequent")
    }

    func getRecentFoods() async throws -> [RecentFood] {
        return try await get("/api/food/entries/recent")
    }

    // MARK: - Custom Foods

    func getCustomFoods() async throws -> [CustomFood] {
        return try await get("/api/food/custom")
    }

    func createCustomFood(_ data: CreateCustomFoodRequest) async throws -> CustomFood {
        return try await post("/api/food/custom", body: data)
    }

    func updateCustomFood(id: String, data: UpdateCustomFoodRequest) async throws -> CustomFood {
        return try await post("/api/food/custom/\(id)", method: "PUT", body: data)
    }

    func deleteCustomFood(id: String) async throws {
        try await delete("/api/food/custom/\(id)")
    }

    // MARK: - Community Foods

    func getCommunityFoods(status: String = "ALL", page: Int? = nil,
                            limit: Int? = nil) async throws -> [CommunityFood] {
        var qs = "status=\(status)"
        if let p = page  { qs += "&page=\(p)" }
        if let l = limit { qs += "&limit=\(l)" }
        return try await get("/api/food/community?\(qs)")
    }

    func updateCommunityFood(id: String,
                              data: CreateCommunityFoodRequest) async throws -> CommunityFood {
        return try await post("/api/food/community/\(id)", method: "PUT", body: data)
    }

    func deleteCommunityFood(id: String) async throws {
        try await delete("/api/food/community/\(id)")
    }

    func createCommunityFood(_ data: CreateCommunityFoodRequest) async throws -> CommunityFood {
        return try await post("/api/food/community", body: data)
    }

    func publishCustomFood(id: String, data: PublishCustomFoodRequest) async throws -> CommunityFood {
        do {
            return try await post("/api/food/custom/\(id)/publish", body: data)
        } catch let err as ApiError where err.statusCode == 429 {
            throw ApiError(statusCode: 429,
                           message: "You've published too many foods today. Try again tomorrow.")
        }
    }

    // MARK: - Search

    func searchFoods(query: String) async throws -> UnifiedSearchResponse {
        return try await get("/api/food/search?q=\(query.urlEncoded)")
    }

    // MARK: - Food Unit Conversions

    func getFoodUnitConversionsForCustomFood(_ customFoodId: String) async throws -> [FoodUnitConversion] {
        return try await get("/api/food/units?customFoodId=\(customFoodId.urlEncoded)")
    }

    func getFoodUnitConversionsForUsdaFood(_ usdaFdcId: Int) async throws -> [FoodUnitConversion] {
        return try await get("/api/food/units?usdaFdcId=\(usdaFdcId)")
    }

    func createFoodUnitConversion(_ data: CreateFoodUnitConversionRequest) async throws -> FoodUnitConversion {
        return try await post("/api/food/units", body: data)
    }

    func updateFoodUnitConversion(id: String,
                                   data: UpdateFoodUnitConversionRequest) async throws -> FoodUnitConversion {
        return try await post("/api/food/units/\(id)", method: "PUT", body: data)
    }

    func deleteFoodUnitConversion(id: String) async throws {
        try await delete("/api/food/units/\(id)")
    }

    func cascadeUnitConversions(_ data: CascadeUnitConversionsRequest) async throws {
        try await deleteWithBody("/api/food/units/cascade", method: "PATCH", body: data)
    }

    // MARK: - Barcode

    func lookupBarcode(code: String) async throws -> BarcodeLookupResult {
        return try await get("/api/barcode/lookup?code=\(code.urlEncoded)")
    }

    func uploadImageForBarcodeScan(imageData: Data,
                                    mimeType: String = "image/jpeg",
                                    fileName: String = "image.jpg") async throws -> BarcodeScanResult? {
        guard let url = URL(string: Config.baseURL + "/api/barcode/scan") else { return nil }

        let boundary = "Boundary-\(UUID().uuidString)"
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)",
                     forHTTPHeaderField: "Content-Type")

        var body = Data()
        body += "--\(boundary)\r\n".utf8Data
        body += "Content-Disposition: form-data; name=\"image\"; filename=\"\(fileName)\"\r\n".utf8Data
        body += "Content-Type: \(mimeType)\r\n\r\n".utf8Data
        body += imageData
        body += "\r\n--\(boundary)--\r\n".utf8Data
        req.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: req)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return try? decoder.decode(BarcodeScanResult.self, from: data)
    }

    // MARK: - Saved Meals

    func getMeals() async throws -> [SavedMeal] {
        return try await get("/api/meals")
    }

    func createMeal(_ data: CreateSavedMealRequest) async throws -> SavedMeal {
        return try await post("/api/meals", body: data)
    }

    func updateMeal(id: String, data: CreateSavedMealRequest) async throws -> SavedMeal {
        return try await post("/api/meals/\(id)", method: "PUT", body: data)
    }

    func deleteMeal(id: String) async throws {
        try await delete("/api/meals/\(id)")
    }

    func logMeal(savedMealId: String, req: LogMealRequest) async throws -> [FoodEntry] {
        return try await post("/api/meals/\(savedMealId)/log", body: req)
    }

    // MARK: - Community Food Reporting

    func reportCommunityFood(id: String, reason: String, details: String? = nil) async throws {
        struct Body: Encodable { let reason: String; let details: String? }
        try await deleteWithBody("/api/food/community/\(id)/report",
                                  method: "POST",
                                  body: Body(reason: reason, details: details))
    }
}

// MARK: - Helpers

private nonisolated struct EmptyResponse: Decodable {}

private extension String {
    nonisolated var urlEncoded: String {
        addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? self
    }

    nonisolated var utf8Data: Data { data(using: .utf8) ?? Data() }
}

private extension Data {
    nonisolated static func += (lhs: inout Data, rhs: Data) { lhs.append(rhs) }
}
