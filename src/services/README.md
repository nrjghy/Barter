# Service Layer Architecture

This directory contains the business logic layer for the Barter application. The service layer provides a clean separation between the UI components and the data access layer, making the codebase more maintainable, testable, and scalable.

## Architecture Overview

The service layer follows a **Service-Oriented Architecture (SOA)** pattern with the following principles:

- **Separation of Concerns**: Business logic is separated from UI and data access
- **Single Responsibility**: Each service handles a specific domain
- **Dependency Injection**: Services are stateless and can be easily tested
- **Error Handling**: Consistent error handling across all services
- **Type Safety**: Full TypeScript support with comprehensive type definitions

## Directory Structure

```
src/services/
├── types.ts           # Service-specific types and interfaces
├── config.ts          # Configuration constants and business rules
├── validation.ts      # Input validation service
├── swipeService.ts    # Swipe and match creation logic
├── itemService.ts     # Item management logic
├── matchService.ts    # Match management logic
├── userService.ts     # User profile management logic
├── index.ts          # Service exports
└── README.md         # This documentation
```

## Core Services

### 1. ValidationService

Centralized input validation for all service operations.

**Key Features:**

- Input sanitization and validation
- Consistent error messages
- Reusable validation rules
- Type-safe validation results

**Usage:**

```typescript
import { ValidationService } from "../services";

// Validate user input
const error = ValidationService.validateUsername(username);
if (error) {
  // Handle validation error
}
```

### 2. SwipeService

Handles all swipe-related business logic including match creation.

**Key Features:**

- Swipe recording and limit checking
- Automatic match creation
- Swipe history management
- Business rule enforcement

**Usage:**

```typescript
import { SwipeService } from "../services";

// Record a swipe
const result = await SwipeService.recordSwipe({
  userId: "user-id",
  itemId: "item-id",
  direction: "right",
});

if (result.error) {
  // Handle error
}
```

### 3. ItemService

Manages item-related operations including CRUD operations and filtering.

**Key Features:**

- Item creation, reading, updating, and deletion
- Advanced filtering and pagination
- User-specific item management
- Image and metadata handling

**Usage:**

```typescript
import { ItemService } from "../services";

// Get items with filtering
const result = await ItemService.getItems({
  page: 0,
  limit: 20,
  excludeUserId: "current-user-id",
  categories: ["electronics"],
});
```

### 4. MatchService

Handles match lifecycle and status management.

**Key Features:**

- Match retrieval and filtering
- Status updates (accept/reject)
- Match statistics
- User authorization checks

**Usage:**

```typescript
import { MatchService } from "../services";

// Update match status
const result = await MatchService.updateMatch(matchId, { status: "accepted" }, userId);
```

### 5. UserService

Manages user profiles and user-related operations.

**Key Features:**

- Profile management
- Username availability checking
- User statistics
- Account management

**Usage:**

```typescript
import { UserService } from "../services";

// Get user profile
const result = await UserService.getUserProfile(userId);
```

## Configuration

The `config.ts` file contains all application constants and business rules:

- **APP_CONFIG**: Application-wide settings
- **VALIDATION_RULES**: Input validation constraints
- **BUSINESS_RULES**: Domain-specific business logic
- **ERROR_CODES**: Standardized error codes
- **SUCCESS_MESSAGES**: Success message templates
- **TABLES**: Database table names
- **CHANNELS**: Real-time channel names

## Error Handling

All services return a consistent `ServiceResult<T>` type:

```typescript
interface ServiceResult<T> {
  data?: T;
  error?: ServiceError;
}

interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
}
```

**Error Handling Best Practices:**

1. Always check for errors before accessing data
2. Use error codes for conditional logic
3. Log detailed errors for debugging
4. Provide user-friendly error messages

## Type Safety

The service layer provides comprehensive TypeScript support:

- **Service-specific interfaces**: Each service defines its own data types
- **Generic result types**: Consistent return types across services
- **Input validation**: Type-safe validation with clear error messages
- **Configuration types**: Strongly typed configuration objects

## Integration with React Query

Services are designed to work seamlessly with React Query:

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import { ItemService } from "../services";

// In a React component
const { data, isLoading, error } = useQuery({
  queryKey: ["items", userId],
  queryFn: () => ItemService.getUserItems(userId),
  enabled: !!userId,
});

const createItem = useMutation({
  mutationFn: (itemData) => ItemService.createItem(itemData, userId),
  onSuccess: () => {
    queryClient.invalidateQueries(["items", userId]);
  },
});
```

## Testing

Services are designed to be easily testable:

- **Stateless**: No internal state to manage
- **Pure functions**: Predictable outputs for given inputs
- **Dependency injection**: Easy to mock dependencies
- **Error scenarios**: Clear error handling for testing edge cases

**Example Test:**

```typescript
import { SwipeService } from "../services";

describe("SwipeService", () => {
  it("should validate swipe data", async () => {
    const result = await SwipeService.recordSwipe({
      userId: "invalid-uuid",
      itemId: "valid-uuid",
      direction: "right",
    });

    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });
});
```

## Best Practices

### 1. Service Design

- Keep services focused on a single domain
- Use static methods for stateless operations
- Provide comprehensive error handling
- Include input validation for all public methods

### 2. Error Handling

- Always return `ServiceResult<T>` type
- Use standardized error codes
- Provide meaningful error messages
- Include error details for debugging

### 3. Performance

- Implement proper caching strategies
- Use pagination for large datasets
- Optimize database queries
- Consider real-time updates where appropriate

### 4. Security

- Validate all inputs
- Implement proper authorization checks
- Sanitize user data
- Use parameterized queries

### 5. Maintainability

- Write comprehensive documentation
- Use consistent naming conventions
- Implement proper logging
- Follow TypeScript best practices

## Migration Guide

When migrating from direct Supabase calls to services:

1. **Replace direct calls**: Replace `supabase.from().select()` with service methods
2. **Update error handling**: Use `ServiceResult<T>` pattern
3. **Add validation**: Use `ValidationService` for input validation
4. **Update types**: Use service-specific interfaces
5. **Test thoroughly**: Ensure all functionality works as expected

## Future Enhancements

Planned improvements for the service layer:

- **Caching layer**: Implement Redis or in-memory caching
- **Rate limiting**: Add rate limiting for API calls
- **Audit logging**: Track all service operations
- **Metrics collection**: Monitor service performance
- **Service composition**: Combine multiple services for complex operations
- **Background jobs**: Implement async job processing
- **Event sourcing**: Track all state changes
- **API versioning**: Support multiple API versions

## Contributing

When adding new services:

1. Follow the existing patterns and conventions
2. Add comprehensive TypeScript types
3. Include input validation
4. Write unit tests
5. Update this documentation
6. Add error handling
7. Consider performance implications
8. Follow security best practices
