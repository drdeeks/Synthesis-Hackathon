/**
 * Enterprise Error Handling Module
 * Implements structured error codes, error boundaries, and graceful degradation
 */

export enum ErrorSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO'
}

export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  GIT = 'GIT',
  AI = 'AI',
  SLICE = 'SLICE',
  CREDENTIAL = 'CREDENTIAL',
  SYSTEM = 'SYSTEM',
  NETWORK = 'NETWORK',
  CONFIGURATION = 'CONFIGURATION'
}

export interface StructuredError {
  code: string;
  message: string;
  details?: string;
  timestamp: string;
  requestId?: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  userActions?: string[];
  context?: Record<string, unknown>;
}

/**
 * Error Code Registry
 * Format: CATEGORY_NNN
 */
export const ErrorCodes = {
  // Validation Errors (VAL_001 - VAL_999)
  VAL_001: 'VAL_001', // Invalid repository path
  VAL_002: 'VAL_002', // Empty repository
  VAL_003: 'VAL_003', // Invalid contributor data
  VAL_004: 'VAL_004', // Invalid analysis parameters
  VAL_005: 'VAL_005', // Invalid output format
  VAL_006: 'VAL_006', // Missing required field
  VAL_007: 'VAL_007', // Invalid date range
  VAL_008: 'VAL_008', // Invalid score value
  
  // Git Errors (GIT_001 - GIT_999)
  GIT_001: 'GIT_001', // Repository not found
  GIT_002: 'GIT_002', // Not a git repository
  GIT_003: 'GIT_003', // Git command failed
  GIT_004: 'GIT_004', // No commits found
  GIT_005: 'GIT_005', // Branch access failed
  GIT_006: 'GIT_006', // Log parsing failed
  GIT_007: 'GIT_007', // Permission denied
  
  // AI Errors (AI_001 - AI_999)
  AI_001: 'AI_001', // API key missing
  AI_002: 'AI_002', // API request failed
  AI_003: 'AI_003', // Rate limit exceeded
  AI_004: 'AI_004', // Invalid response format
  AI_005: 'AI_005', // Model not available
  AI_006: 'AI_006', // Context too long
  AI_007: 'AI_007', // Assessment timeout
  
  // Slice Errors (SLC_001 - SLC_999)
  SLC_001: 'SLC_001', // Invalid slice configuration
  SLC_002: 'SLC_002', // Share calculation error
  SLC_003: 'SLC_003', // Address generation failed
  SLC_004: 'SLC_004', // Invalid total value
  
  // Credential Errors (CRD_001 - CRD_999)
  CRD_001: 'CRD_001', // Credential generation failed
  CRD_002: 'CRD_002', // Signing failed
  CRD_003: 'CRD_003', // Invalid proof format
  CRD_004: 'CRD_004', // Merkle tree error
  
  // System Errors (SYS_001 - SYS_999)
  SYS_001: 'SYS_001', // Internal error
  SYS_002: 'SYS_002', // Memory exhausted
  SYS_003: 'SYS_003', // Disk space low
  SYS_004: 'SYS_004', // Process timeout
  SYS_005: 'SYS_005', // Unexpected state
  
  // Network Errors (NET_001 - NET_999)
  NET_001: 'NET_001', // Connection failed
  NET_002: 'NET_002', // Timeout
  NET_003: 'NET_003', // DNS resolution failed
  
  // Configuration Errors (CFG_001 - CFG_999)
  CFG_001: 'CFG_001', // Missing configuration
  CFG_002: 'CFG_002', // Invalid configuration
  CFG_003: 'CFG_003', // Environment variable missing
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Base application error class with structured error support
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly retryable: boolean;
  public readonly timestamp: string;
  public readonly requestId?: string;
  public readonly userActions: string[];
  public readonly context: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      retryable?: boolean;
      requestId?: string;
      userActions?: string[];
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.category = options.category ?? this.inferCategory(code);
    this.severity = options.severity ?? ErrorSeverity.MEDIUM;
    this.retryable = options.retryable ?? false;
    this.timestamp = new Date().toISOString();
    this.requestId = options.requestId;
    this.userActions = options.userActions ?? [];
    this.context = options.context ?? {};
    
    if (options.cause) {
      this.cause = options.cause;
    }

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  private inferCategory(code: string): ErrorCategory {
    const prefix = code.substring(0, 3);
    const categoryMap: Record<string, ErrorCategory> = {
      'VAL': ErrorCategory.VALIDATION,
      'GIT': ErrorCategory.GIT,
      'AI_': ErrorCategory.AI,
      'SLC': ErrorCategory.SLICE,
      'CRD': ErrorCategory.CREDENTIAL,
      'SYS': ErrorCategory.SYSTEM,
      'NET': ErrorCategory.NETWORK,
      'CFG': ErrorCategory.CONFIGURATION,
    };
    return categoryMap[prefix] ?? ErrorCategory.SYSTEM;
  }

  toStructuredError(): StructuredError {
    return {
      code: this.code,
      message: this.message,
      details: this.cause instanceof Error ? this.cause.message : undefined,
      timestamp: this.timestamp,
      requestId: this.requestId,
      category: this.category,
      severity: this.severity,
      retryable: this.retryable,
      userActions: this.userActions.length > 0 ? this.userActions : undefined,
      context: Object.keys(this.context).length > 0 ? this.context : undefined,
    };
  }

  toJSON(): StructuredError {
    return this.toStructuredError();
  }
}

// Specific error classes for different categories
export class ValidationError extends AppError {
  constructor(
    code: ErrorCode,
    message: string,
    options: {
      field?: string;
      value?: unknown;
      userActions?: string[];
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(code, message, {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      retryable: false,
      userActions: options.userActions ?? ['Check input values and try again'],
      context: {
        field: options.field,
        value: options.value,
        ...options.context,
      },
    });
    this.name = 'ValidationError';
  }
}

export class GitError extends AppError {
  constructor(
    code: ErrorCode,
    message: string,
    options: {
      repoPath?: string;
      command?: string;
      userActions?: string[];
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(code, message, {
      category: ErrorCategory.GIT,
      severity: ErrorSeverity.HIGH,
      retryable: code === ErrorCodes.GIT_003, // Git command failures may be transient
      userActions: options.userActions ?? ['Verify the repository path', 'Check git installation'],
      context: {
        repoPath: options.repoPath,
        command: options.command,
        ...options.context,
      },
      cause: options.cause,
    });
    this.name = 'GitError';
  }
}

export class AIError extends AppError {
  constructor(
    code: ErrorCode,
    message: string,
    options: {
      model?: string;
      statusCode?: number;
      userActions?: string[];
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    const retryable = [ErrorCodes.AI_002, ErrorCodes.AI_003, ErrorCodes.AI_007].includes(code);
    super(code, message, {
      category: ErrorCategory.AI,
      severity: code === ErrorCodes.AI_003 ? ErrorSeverity.LOW : ErrorSeverity.MEDIUM,
      retryable,
      userActions: options.userActions ?? ['Check API key', 'Verify model availability'],
      context: {
        model: options.model,
        statusCode: options.statusCode,
        ...options.context,
      },
      cause: options.cause,
    });
    this.name = 'AIError';
  }
}

export class SliceError extends AppError {
  constructor(
    code: ErrorCode,
    message: string,
    options: {
      userActions?: string[];
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(code, message, {
      category: ErrorCategory.SLICE,
      severity: ErrorSeverity.HIGH,
      retryable: false,
      userActions: options.userActions ?? ['Verify contribution scores', 'Check configuration'],
      context: options.context,
      cause: options.cause,
    });
    this.name = 'SliceError';
  }
}

export class CredentialError extends AppError {
  constructor(
    code: ErrorCode,
    message: string,
    options: {
      userActions?: string[];
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(code, message, {
      category: ErrorCategory.CREDENTIAL,
      severity: ErrorSeverity.HIGH,
      retryable: false,
      userActions: options.userActions ?? ['Verify credential data', 'Check signing keys'],
      context: options.context,
      cause: options.cause,
    });
    this.name = 'CredentialError';
  }
}

export class SystemError extends AppError {
  constructor(
    code: ErrorCode,
    message: string,
    options: {
      userActions?: string[];
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(code, message, {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.CRITICAL,
      retryable: true,
      userActions: options.userActions ?? ['Retry the operation', 'Contact support if issue persists'],
      context: options.context,
      cause: options.cause,
    });
    this.name = 'SystemError';
  }
}

export class NetworkError extends AppError {
  constructor(
    code: ErrorCode,
    message: string,
    options: {
      url?: string;
      statusCode?: number;
      userActions?: string[];
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(code, message, {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      retryable: true,
      userActions: options.userActions ?? ['Check network connection', 'Retry the request'],
      context: {
        url: options.url,
        statusCode: options.statusCode,
        ...options.context,
      },
      cause: options.cause,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Error boundary for graceful degradation
 */
export class ErrorBoundary {
  private static fallbacks: Map<ErrorCategory, () => unknown> = new Map();

  static registerFallback<T>(category: ErrorCategory, fallback: () => T): void {
    this.fallbacks.set(category, fallback);
  }

  static async execute<T>(
    operation: () => Promise<T>,
    options: {
      category: ErrorCategory;
      fallback?: () => T;
      onError?: (error: AppError) => void;
    }
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const appError = error instanceof AppError 
        ? error 
        : new SystemError(ErrorCodes.SYS_001, 'Unexpected error occurred', { cause: error as Error });

      if (options.onError) {
        options.onError(appError);
      }

      const fallback = options.fallback ?? this.fallbacks.get(options.category);
      if (fallback) {
        return fallback() as T;
      }

      throw appError;
    }
  }
}

/**
 * Retry handler with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
    onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    shouldRetry = (error) => error instanceof AppError && error.retryable,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      // Exponential backoff with jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 0.3 * exponentialDelay;
      const delayMs = Math.min(exponentialDelay + jitter, maxDelayMs);

      if (onRetry) {
        onRetry(attempt, error, delayMs);
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Convert unknown errors to AppError
 */
export function toAppError(error: unknown, defaultCode: ErrorCode = ErrorCodes.SYS_001): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new SystemError(defaultCode, error.message, { cause: error });
  }

  return new SystemError(defaultCode, String(error));
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T>(
  input: string,
  defaultValue: T
): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Assert condition or throw validation error
 */
export function assertValid(
  condition: boolean,
  code: ErrorCode,
  message: string,
  options?: {
    field?: string;
    value?: unknown;
  }
): asserts condition {
  if (!condition) {
    throw new ValidationError(code, message, options);
  }
}
