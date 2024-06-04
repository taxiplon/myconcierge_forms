document.addEventListener('DOMContentLoaded', function() {
    const addPricesButton = document.getElementById('addPrices');
    const transferTableBody = document.querySelector('#transferTable tbody');

    addPricesButton.addEventListener('click', function() {
  const newRow = document.createElement('tr');
  newRow.innerHTML = `
      <td><input type="text" name="fromAddress" class="form-control"></td>
      <td><input type="text" name="toAddress" class="form-control"></td>
      <td>
          <select name="vehicleType" class="form-control">
            <option value="noCarType">Επιλέξτε Όχημα</option>
            <option value="Standard Taxi">Standard Taxi</option>
            <option value="Executive">Executive</option>
            <option value="Limo">Limo</option>
            <option value="Mini Van">Mini Van</option>
            <option value="Mini Bus">Mini Bus</option>
          </select>
      </td>
      <td><input type="text" name="dayPrice" class="form-control"></td>
      <td><input type="text" name="nightPrice" class="form-control"></td>
  `;
  transferTableBody.appendChild(newRow);
});
});