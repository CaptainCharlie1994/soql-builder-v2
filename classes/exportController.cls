public with sharing class exportController {
    public class ExportResponse {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String message;
    }

    @AuraEnabled
    public static ExportResponse emailCsv(
        String objectName,
        List<Map<String, Object>> data,
        String recipientEmail
    ) {
        ExportResponse response = new ExportResponse();
        response.success = false;

        try {
            if (String.isBlank(recipientEmail)) {
                response.message = 'Recipient email is missing.';
                return response;
            }

            if (data == null || data.isEmpty()) {
                response.message = 'No data to export.';
                return response;
            }

            List<String> headers = new List<String>(data[0].keySet());
            List<String> csvLines = new List<String>();
            csvLines.add(String.join(headers, ','));

            for (Map<String, Object> row : data) {
                List<String> values = new List<String>();
                for (String h : headers) {
                    String cell = String.valueOf(row.get(h));
                    if (cell == null) cell = '';
                    if (cell.contains('"') || cell.contains(',') || cell.contains('\n')) {
                        cell = '"' + cell.replaceAll('"', '""') + '"';
                    }
                    values.add(cell);
                }
                csvLines.add(String.join(values, ','));
            }

            Messaging.EmailFileAttachment attachment = new Messaging.EmailFileAttachment();
            attachment.setFileName('query-results-' + objectName + '.csv');
            attachment.setBody(Blob.valueOf(String.join(csvLines, '\n')));
            attachment.setContentType('text/csv');

            Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
            mail.setToAddresses(new List<String>{ recipientEmail });
            mail.setSubject('Exported Query Results - ' + objectName);
            mail.setPlainTextBody('Please find the attached CSV file of your query results.');
            mail.setFileAttachments(new List<Messaging.EmailFileAttachment>{ attachment });

            Messaging.SendEmailResult[] results = Messaging.sendEmail(
                new List<Messaging.SingleEmailMessage>{ mail }
            );

            if (results != null && !results.isEmpty() && results[0].isSuccess()) {
                response.success = true;
                response.message = 'Email sent successfully to ' + recipientEmail;
            } else {
                Messaging.SendEmailError[] errors = results[0].getErrors();
                response.message = errors.isEmpty()
                    ? 'Unknown email error occurred.'
                    : errors[0].getMessage();
            }
        } catch (Exception e) {
            response.message = 'Apex exception: ' + e.getMessage();
        }

        return response;
    }
}