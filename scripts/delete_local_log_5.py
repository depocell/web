import sqlite3
conn = sqlite3.connect('MASTER/master_data.db')
conn.execute('DELETE FROM survey_churn_logs WHERE id = 5')
conn.commit()
conn.close()
print('local log 5 deleted')
