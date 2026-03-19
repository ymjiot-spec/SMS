# Requirements Document

## Introduction

本ドキュメントは、Zendesk連携型SMS送信・管理ツールの要件を定義します。このツールは、Zendeskサポート業務においてオペレーターが顧客へSMSを効率的に送信し、送信履歴を管理し、Zendeskチケットと連携するためのシステムです。

## Glossary

- **SMS_Tool**: Zendesk連携型SMS送信・管理ツール全体を指すシステム
- **SMS_Sender**: SMS送信機能を担当するコンポーネント
- **Template_Manager**: テンプレートの保存・編集・削除・検索を管理するコンポーネント
- **Delivery_Tracker**: SMS配信ステータスを追跡・更新するコンポーネント
- **Zendesk_Connector**: Zendeskとの連携（チケット情報取得、社内メモ記録）を担当するコンポーネント
- **History_Manager**: 送信履歴の保存・検索・出力を管理するコンポーネント
- **SMS_Provider**: 外部SMSサービス（Media4u等）との通信を抽象化したインターフェース
- **Operator**: SMS送信を行う一般オペレーターユーザー
- **Supervisor**: テンプレート管理や全履歴閲覧が可能な管理者ユーザー
- **System_Admin**: APIキーや環境設定を管理するシステム管理者
- **Delivery_Status**: SMS配信状態（queued, sent, delivered, failed, expired, unknown）
- **Template**: 再利用可能なSMS本文のひな形
- **Internal_Note**: Zendeskチケットの社内メモ

## Requirements

### Requirement 1: SMS送信

**User Story:** As an Operator, I want to send SMS messages to customers from the tool, so that I can communicate with customers efficiently during support operations.

#### Acceptance Criteria

1. WHEN an Operator enters a valid phone number and message body and clicks the send button, THE SMS_Sender SHALL transmit the SMS via the configured SMS_Provider
2. WHEN the SMS_Provider returns a successful response, THE SMS_Sender SHALL display a success message with the external message ID
3. IF the SMS_Provider returns an error, THEN THE SMS_Sender SHALL display the error message with the specific failure reason
4. THE SMS_Sender SHALL validate that the phone number matches the Japanese mobile phone format (070/080/090 prefix, 11 digits) before sending
5. IF the message body is empty, THEN THE SMS_Sender SHALL prevent submission and display a validation error
6. WHEN an Operator initiates a send, THE SMS_Sender SHALL complete the operation within 3 clicks from the main screen

### Requirement 2: テンプレート管理

**User Story:** As an Operator, I want to use and manage SMS templates organized by company and purpose, so that I can send consistent messages quickly.

#### Acceptance Criteria

1. THE Template_Manager SHALL allow users to create, read, update, and delete templates
2. THE Template_Manager SHALL support template classification by company, brand, purpose, department, and visibility scope
3. WHEN an Operator searches templates by keyword, THE Template_Manager SHALL return matching templates within 500ms
4. THE Template_Manager SHALL support marking templates as favorites for quick access
5. THE Template_Manager SHALL display the last used timestamp for each template
6. THE Template_Manager SHALL support template duplication to create new templates based on existing ones
7. WHILE a template contains placeholder variables, THE Template_Manager SHALL validate that all variables are in the supported format ({{variable_name}})

### Requirement 3: テンプレート変数展開

**User Story:** As an Operator, I want templates to automatically fill in customer and ticket information, so that I can send personalized messages without manual editing.

#### Acceptance Criteria

1. THE Template_Manager SHALL support the following placeholder variables: {{customer_name}}, {{phone}}, {{ticket_id}}, {{agent_name}}, {{company_name}}, {{today}}, {{support_email}}, {{short_url}}
2. WHEN an Operator selects a template, THE SMS_Tool SHALL display a preview with all variables expanded to their actual values
3. IF a required variable value is not available, THEN THE SMS_Tool SHALL highlight the unresolved variable and prevent sending until resolved
4. THE Template_Manager SHALL parse template text and identify all placeholder variables
5. FOR ALL valid templates, parsing then rendering then parsing SHALL produce an equivalent template structure (round-trip property)

### Requirement 4: 自分にも送信

**User Story:** As an Operator, I want to receive a copy of the SMS I send to customers, so that I can verify the message content and keep a personal record.

#### Acceptance Criteria

1. WHEN the "send copy to self" checkbox is enabled, THE SMS_Sender SHALL send an identical SMS to the Operator's registered phone number
2. THE History_Manager SHALL store the self-copy SMS log separately with a "self_copy" type designation
3. THE History_Manager SHALL store the customer SMS log with a "customer" type designation
4. IF the self-copy send fails but the customer send succeeds, THEN THE SMS_Sender SHALL display a partial success message indicating the self-copy failure

### Requirement 5: テスト送信

**User Story:** As a Supervisor, I want to send test SMS messages to a designated test number, so that I can verify template content before production use.

#### Acceptance Criteria

1. WHEN a Supervisor clicks the test send button, THE SMS_Sender SHALL send the SMS to the configured test phone number
2. THE History_Manager SHALL store test sends with a "test" type designation, separate from production logs
3. THE SMS_Tool SHALL display a clear visual distinction between the test send button and the production send button using different colors and positions
4. THE SMS_Tool SHALL include a "[TEST]" prefix in the test SMS content to clearly identify test messages

### Requirement 6: 到達確認

**User Story:** As an Operator, I want to check the delivery status of sent SMS messages, so that I can confirm customers received my messages.

#### Acceptance Criteria

1. THE Delivery_Tracker SHALL track the following statuses: queued, sent, delivered, failed, expired, unknown
2. WHEN an SMS is sent, THE Delivery_Tracker SHALL store the initial status from the SMS_Provider response
3. THE Delivery_Tracker SHALL update delivery status via periodic polling at configurable intervals
4. WHERE webhook support is enabled, THE Delivery_Tracker SHALL accept and process delivery status updates from the SMS_Provider
5. WHEN an Operator views the SMS history, THE SMS_Tool SHALL display the current delivery status for each message
6. THE Delivery_Tracker SHALL log all status change events with timestamps in the delivery_events table

### Requirement 7: Zendesk連携 - チケット情報取得

**User Story:** As an Operator, I want the tool to automatically retrieve ticket and customer information from Zendesk, so that I can send SMS without manual data entry.

#### Acceptance Criteria

1. WHEN the SMS_Tool is opened from a Zendesk ticket sidebar, THE Zendesk_Connector SHALL retrieve the current ticket ID
2. WHEN a ticket ID is available, THE Zendesk_Connector SHALL attempt to retrieve the customer phone number from the ticket requester information
3. IF the customer phone number is available in Zendesk, THEN THE SMS_Tool SHALL pre-populate the phone number field
4. THE SMS_Tool SHALL display the ticket ID and basic ticket information in the upper section of the interface

### Requirement 8: Zendesk連携 - 社内メモ自動記録

**User Story:** As an Operator, I want SMS send records to be automatically logged to Zendesk ticket internal notes, so that the support team can see communication history in one place.

#### Acceptance Criteria

1. WHEN an SMS is successfully sent from a Zendesk ticket context, THE Zendesk_Connector SHALL create an internal note on the ticket
2. THE Zendesk_Connector SHALL format the internal note with the following fields: destination phone number, send type, template name, message body, sender name, send timestamp, send result, delivery status, external message ID
3. IF the internal note creation fails, THEN THE SMS_Tool SHALL display a warning but not roll back the SMS send
4. THE Zendesk_Connector SHALL use a consistent format template for all internal notes

### Requirement 9: 送信履歴管理

**User Story:** As an Operator, I want to search and view SMS send history, so that I can track past communications and audit message content.

#### Acceptance Criteria

1. THE History_Manager SHALL support filtering history by: ticket ID, customer phone number, operator, template, date range, and delivery status
2. WHEN an Operator searches history, THE History_Manager SHALL return results within 1 second for queries spanning up to 90 days
3. THE History_Manager SHALL support CSV export of filtered history results
4. THE History_Manager SHALL store the complete message body for audit purposes
5. THE History_Manager SHALL record the sender identity for every SMS log entry

### Requirement 10: 誤送信防止

**User Story:** As an Operator, I want the system to help prevent accidental or erroneous SMS sends, so that I can avoid sending messages to wrong recipients or with incorrect content.

#### Acceptance Criteria

1. THE SMS_Sender SHALL validate phone number format before enabling the send button
2. THE SMS_Sender SHALL detect and warn about predefined dangerous keywords in the message body
3. WHEN an Operator clicks the send button, THE SMS_Tool SHALL display a confirmation modal showing the recipient number and message preview
4. THE SMS_Sender SHALL enforce a rate limit preventing more than 10 sends per minute per operator
5. IF an Operator attempts to send to the same phone number within 5 minutes, THEN THE SMS_Sender SHALL display a duplicate send warning
6. WHEN a ticket context is available, THE SMS_Tool SHALL display recent send history for that ticket before sending

### Requirement 11: 権限管理

**User Story:** As a System_Admin, I want to control user access based on roles, so that sensitive operations are restricted to authorized personnel.

#### Acceptance Criteria

1. THE SMS_Tool SHALL enforce three permission levels: Operator, Supervisor, and System_Admin
2. WHILE a user has Operator role, THE SMS_Tool SHALL allow: SMS sending, template usage, personal template creation, and viewing own send history
3. WHILE a user has Supervisor role, THE SMS_Tool SHALL allow all Operator permissions plus: all template management, all history viewing, error log viewing, brand-specific template management, test send configuration
4. WHILE a user has System_Admin role, THE SMS_Tool SHALL allow all Supervisor permissions plus: API key configuration, environment settings, provider configuration, webhook settings, Zendesk integration settings
5. IF a user attempts an unauthorized action, THEN THE SMS_Tool SHALL deny the request and log the attempt

### Requirement 12: SMSプロバイダ抽象化

**User Story:** As a System_Admin, I want the SMS provider to be abstracted behind an interface, so that we can switch providers without changing application code.

#### Acceptance Criteria

1. THE SMS_Provider interface SHALL define the following methods: sendMessage(), getDeliveryStatus(), validateConfig()
2. THE SMS_Tool SHALL include a Media4uProvider implementation for production use
3. THE SMS_Tool SHALL include a MockProvider implementation for development and testing
4. WHEN the SMS_Tool initializes, THE SMS_Provider SHALL validate its configuration and report any errors
5. FOR ALL SMS_Provider implementations, sendMessage() followed by getDeliveryStatus() SHALL return a valid Delivery_Status

### Requirement 13: UIレイアウト

**User Story:** As an Operator, I want a single-screen interface with minimal navigation, so that I can complete SMS tasks quickly without switching between pages.

#### Acceptance Criteria

1. THE SMS_Tool SHALL display all primary functions on a single screen without page navigation
2. THE SMS_Tool SHALL organize the interface with: ticket information at top, template selection and message editing in center, send buttons and results at bottom
3. THE SMS_Tool SHALL provide sub-tabs for template management and history viewing without leaving the main screen
4. THE SMS_Tool SHALL support both Zendesk sidebar app mode and standalone web app mode with the same core interface

### Requirement 14: 監査ログ

**User Story:** As a Supervisor, I want all significant actions to be logged for audit purposes, so that we can review system usage and investigate issues.

#### Acceptance Criteria

1. THE SMS_Tool SHALL log all SMS send attempts with: timestamp, operator ID, recipient number, message content, template ID (if used), result status
2. THE SMS_Tool SHALL log all template modifications with: timestamp, user ID, action type, before/after values
3. THE SMS_Tool SHALL log all permission-denied events with: timestamp, user ID, attempted action
4. THE History_Manager SHALL retain audit logs for a minimum of 2 years
5. THE audit log format SHALL be parseable for automated analysis
6. FOR ALL audit log entries, serializing then deserializing SHALL produce an equivalent log entry (round-trip property)
